// Package application holds the PluginManager — the central coordinator for
// plugin lifecycle: deploy, stop, configure, health-check, and gRPC routing.
package application

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"google.golang.org/grpc"

	commonDomain "github.com/kleff/go-common/domain"
	grpcpool "github.com/kleffio/platform/internal/core/plugins/adapters/grpc"
	"github.com/kleffio/platform/internal/core/plugins/domain"
	"github.com/kleffio/platform/internal/core/plugins/ports"
	"github.com/kleffio/platform/internal/shared/runtime"
	pluginsv1 "github.com/kleffio/plugin-sdk-go/v1"
)

const (
	activeIDPSettingKey   = "active_idp_plugin"
	grpcPort              = 50051
	healthCheckInterval   = 30 * time.Second
	maxRestartAttempts    = 3
	refreshCooldown       = 5 * time.Minute
	autoSyncInterval      = 24 * time.Hour
	autoSyncCheckInterval = time.Hour
)

// Manager implements ports.PluginManager.
type Manager struct {
	store        ports.PluginStore
	registry     ports.PluginRegistry
	rt           runtime.RuntimeAdapter
	pool         *grpcpool.Pool
	secretKey    []byte // 32-byte AES-256 key
	logger       *slog.Logger
	projectName  string            // Docker Compose project name (e.g. "kleff")
	companionEnv map[string]string // global env vars injected into every companion

	mu           sync.RWMutex
	statuses     map[string]domain.PluginStatus
	restarts     map[string]int
	capabilities map[string]map[string]bool // plugin ID → set of declared capabilities
	routes       []pluginRoute              // flat list of all declared plugin HTTP routes
	activeIDP    string                     // cached from store; set by SetActiveIDP and loaded on Start
	caCerts      map[string][]byte          // ephemeral CA cert PEM per plugin, for mTLS
}

// pluginRoute is one entry in the route registry.
type pluginRoute struct {
	pluginID string
	method   string // HTTP method or "*"
	path     string // exact or prefix ending in "*"
	public   bool
}

// New creates a PluginManager and starts the background health-check loop.
// secretKey is used for AES-256-GCM encryption of plugin secrets; it must be
// exactly 32 bytes (derive with SHA-256 from SECRET_KEY env var).
func New(
	store ports.PluginStore,
	registry ports.PluginRegistry,
	rt runtime.RuntimeAdapter,
	secretKey []byte,
	projectName string,
	companionEnv map[string]string,
	logger *slog.Logger,
) *Manager {
	m := &Manager{
		store:        store,
		registry:     registry,
		rt:           rt,
		pool:         grpcpool.NewPool(),
		secretKey:    secretKey,
		projectName:  projectName,
		companionEnv: companionEnv,
		logger:       logger,
		statuses:     make(map[string]domain.PluginStatus),
		restarts:     make(map[string]int),
		capabilities: make(map[string]map[string]bool),
		caCerts:      make(map[string][]byte),
	}
	return m
}

// Start loads all enabled plugins from the store, ensures their containers are
// running, and starts the background health-check goroutine.
// Call this after the DB is ready.
func (m *Manager) Start(ctx context.Context) error {
	plugins, err := m.store.ListAll(ctx)
	if err != nil {
		return fmt.Errorf("plugin manager: load plugins: %w", err)
	}

	for _, p := range plugins {
		if !p.Enabled {
			m.setStatus(p.ID, domain.PluginStatusDisabled)
			continue
		}
		// Tier 0: no container — mark running and register manifest capabilities.
		if p.Image == "" {
			m.setStatus(p.ID, domain.PluginStatusRunning)
			if mf, err := m.registry.GetManifest(ctx, p.ID); err == nil && mf != nil {
				caps := make(map[string]bool, len(mf.Capabilities))
				for _, c := range mf.Capabilities {
					caps[c] = true
				}
				m.mu.Lock()
				m.capabilities[p.ID] = caps
				m.mu.Unlock()
			}
			continue
		}
		if err := m.ensureRunning(ctx, p); err != nil {
			m.logger.Warn("plugin manager: startup: failed to start plugin",
				"id", p.ID, "error", err)
			m.setStatus(p.ID, domain.PluginStatusError)
		}
	}

	// Cache the active IDP so HasIdentityProvider() works before capability discovery runs.
	if activeID, err := m.store.GetSetting(ctx, activeIDPSettingKey); err == nil && activeID != "" {
		m.mu.Lock()
		m.activeIDP = activeID
		m.mu.Unlock()
	}

	// All plugins are now running and all capabilities registered. Do one
	// synchronous pass to re-resolve capability-dependent fields so that
	// install order doesn't matter (e.g. Alloy installed before VictoriaMetrics).
	// Pass "" so no plugin is excluded from re-resolution.
	m.reResolveCapabilityDependents(ctx, "")

	go m.healthLoop(ctx)
	go m.registrySyncLoop(ctx)
	return nil
}

var _ ports.PluginManager = (*Manager)(nil)

// Install deploys a new plugin container, persists config, and dials gRPC.
func (m *Manager) Install(ctx context.Context, manifest *domain.CatalogManifest, config map[string]string) (*domain.Plugin, error) {
	// Validate that all declared dependencies are installed and enabled.
	if len(manifest.Dependencies) > 0 {
		installed, err := m.store.ListAll(ctx)
		if err != nil {
			return nil, fmt.Errorf("install plugin: check dependencies: %w", err)
		}
		enabledByID := make(map[string]bool, len(installed))
		for _, p := range installed {
			enabledByID[p.ID] = p.Enabled
		}
		for _, depID := range manifest.Dependencies {
			enabled, ok := enabledByID[depID]
			if !ok {
				return nil, fmt.Errorf("install plugin: dependency %q is not installed", depID)
			}
			if !enabled {
				return nil, fmt.Errorf("install plugin: dependency %q is installed but not enabled", depID)
			}
		}
	}

	// Separate plain config from secrets, applying manifest defaults for any
	// field the caller did not explicitly provide.
	plainCfg := map[string]string{}
	secretCfg := map[string]string{}
	for _, field := range manifest.Config {
		val, ok := config[field.Key]
		if !ok || val == "" {
			if field.Default != "" {
				val = field.Default
			} else {
				continue
			}
		}
		if field.Type == "secret" {
			secretCfg[field.Key] = val
		} else {
			plainCfg[field.Key] = val
		}
	}

	configJSON, err := json.Marshal(plainCfg)
	if err != nil {
		return nil, fmt.Errorf("install plugin: marshal config: %w", err)
	}
	secretsJSON, err := m.encryptSecrets(secretCfg)
	if err != nil {
		return nil, fmt.Errorf("install plugin: encrypt secrets: %w", err)
	}

	tier := effectiveTier(manifest)

	// Tier 0 — static plugins: no container, no gRPC. Platform serves the bundle.
	if tier == 0 {
		p := &domain.Plugin{
			ID:           manifest.ID,
			Type:         manifest.Type,
			DisplayName:  manifest.Name,
			Image:        "",
			Version:      manifest.Version,
			FrontendURL:  manifest.FrontendURL,
			GRPCAddr:     "",
			Config:       configJSON,
			Secrets:      secretsJSON,
			Enabled:      true,
			Status:       domain.PluginStatusRunning,
			Dependencies: manifest.Dependencies,
			InstalledAt:  time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		}
		if err := m.store.Save(ctx, p); err != nil {
			return nil, fmt.Errorf("install plugin: save: %w", err)
		}
		m.setStatus(p.ID, domain.PluginStatusRunning)
		m.setStaticCapabilities(p.ID, manifest)
		m.logger.Info("plugin installed (static/tier-0)", "id", p.ID)
		return p, nil
	}

	// Tier 1 — container-only: no gRPC. Capabilities come from the manifest.
	if tier == 1 {
		p := &domain.Plugin{
			ID:           manifest.ID,
			Type:         manifest.Type,
			DisplayName:  manifest.Name,
			Image:        pluginImage(manifest.Image, manifest.Version),
			Version:      manifest.Version,
			FrontendURL:  manifest.FrontendURL,
			GRPCAddr:     "",
			Config:       configJSON,
			Secrets:      secretsJSON,
			Enabled:      true,
			Status:       domain.PluginStatusDisabled,
			Dependencies: manifest.Dependencies,
			InstalledAt:  time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		}
		if err := m.store.Save(ctx, p); err != nil {
			return nil, fmt.Errorf("install plugin: save: %w", err)
		}
		m.setStatus(p.ID, domain.PluginStatusInstalling)

		if err := m.deployCompanions(ctx, manifest, config); err != nil {
			m.setStatus(p.ID, domain.PluginStatusError)
			return nil, fmt.Errorf("install plugin: deploy companions: %w", err)
		}
		for _, c := range manifest.Companions {
			if c.SkipIfEnv != "" && c.InternalAddr != "" && config[c.SkipIfEnv] == "" {
				config[c.SkipIfEnv] = c.InternalAddr
			}
		}
		m.resolveCapabilityFields(ctx, manifest, config)

		if manifest.Image != "" {
			spec := m.buildContainerSpec(p, manifest, config, nil, nil)
			if err := m.rt.Deploy(ctx, spec); err != nil {
				m.setStatus(p.ID, domain.PluginStatusError)
				return nil, fmt.Errorf("install plugin: deploy: %w", err)
			}
		}
		m.setStatus(p.ID, domain.PluginStatusRunning)
		p.Status = domain.PluginStatusRunning
		caps := make(map[string]bool, len(manifest.Capabilities))
		for _, c := range manifest.Capabilities {
			caps[c] = true
		}
		m.mu.Lock()
		m.capabilities[p.ID] = caps
		m.mu.Unlock()
		m.logger.Info("plugin installed (tier-1)", "id", p.ID, "image", p.Image)
		return p, nil
	}

	// Tier 2 — container + gRPC.
	grpcAddr := fmt.Sprintf("kleff-%s:%d", manifest.ID, grpcPort)

	p := &domain.Plugin{
		ID:           manifest.ID,
		Type:         manifest.Type,
		DisplayName:  manifest.Name,
		Image:        pluginImage(manifest.Image, manifest.Version),
		Version:      manifest.Version,
		FrontendURL:  manifest.FrontendURL,
		GRPCAddr:     grpcAddr,
		Config:       configJSON,
		Secrets:      secretsJSON,
		Enabled:      manifest.Type != "idp", // IDP plugins require explicit activation
		Status:       domain.PluginStatusDisabled,
		Dependencies: manifest.Dependencies,
		InstalledAt:  time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}

	if err := m.store.Save(ctx, p); err != nil {
		return nil, fmt.Errorf("install plugin: save: %w", err)
	}

	// IDP plugins are installed (config saved) but not started yet.
	// Containers and companions are deferred to SetActiveIDP → ensureRunning,
	// so the user can configure the plugin before committing to running it.
	if manifest.Type == "idp" {
		m.logger.Info("plugin installed (deferred start)", "id", p.ID, "image", p.Image)
		return p, nil
	}

	m.setStatus(p.ID, domain.PluginStatusInstalling)

	// Deploy companion containers declared in the manifest (e.g. Keycloak server).
	if err := m.deployCompanions(ctx, manifest, config); err != nil {
		m.setStatus(p.ID, domain.PluginStatusError)
		return nil, fmt.Errorf("install plugin: deploy companions: %w", err)
	}

	// For each companion that was deployed (not skipped), inject its internal
	// address so the plugin container always has a valid URL to reach it.
	for _, c := range manifest.Companions {
		if c.SkipIfEnv != "" && c.InternalAddr != "" && config[c.SkipIfEnv] == "" {
			config[c.SkipIfEnv] = c.InternalAddr
		}
	}
	m.resolveCapabilityFields(ctx, manifest, config)

	spec, caCertPEM, err := m.buildSecureContainerSpec(p, manifest, config)
	if err != nil {
		m.setStatus(p.ID, domain.PluginStatusError)
		return nil, fmt.Errorf("install plugin: %w", err)
	}
	if err := m.rt.Deploy(ctx, spec); err != nil {
		m.setStatus(p.ID, domain.PluginStatusError)
		return nil, fmt.Errorf("install plugin: deploy: %w", err)
	}
	m.mu.Lock()
	m.caCerts[p.ID] = caCertPEM
	m.mu.Unlock()

	if err := m.pool.Dial(ctx, p.ID, grpcAddr, caCertPEM); err != nil {
		m.setStatus(p.ID, domain.PluginStatusError)
		return nil, fmt.Errorf("install plugin: dial gRPC: %w", err)
	}

	m.setStatus(p.ID, domain.PluginStatusRunning)
	p.Status = domain.PluginStatusRunning
	m.discoverCapabilities(ctx, p.ID)
	m.logger.Info("plugin installed (tier-2)", "id", p.ID, "image", p.Image)

	return p, nil
}

// effectiveTier returns the deployment tier for a manifest:
//   - 0: no container (Image == "" or all capabilities are "ui.manifest")
//   - 1: container only, no gRPC (manifest.Tier == 1)
//   - 2: container + gRPC (default)
func effectiveTier(manifest *domain.CatalogManifest) int {
	if manifest == nil {
		return 2
	}
	if isStaticTier(manifest) {
		return 0
	}
	// No main image but has companions → companion-only plugin, treat as tier-1
	// so companions get deployed (e.g. InfluxDB which IS the companion container).
	if manifest.Image == "" {
		if len(manifest.Companions) > 0 {
			return 1
		}
		return 0
	}
	if manifest.Tier == 1 {
		return 1
	}
	return 2
}

// isStaticTier reports whether a manifest describes a Tier 0 (static/no-container) plugin.
// A plugin is static when all its declared capabilities are "ui.manifest" — no container,
// no gRPC, just a frontend bundle served to the browser.
func isStaticTier(m *domain.CatalogManifest) bool {
	if len(m.Capabilities) == 0 {
		return false
	}
	for _, c := range m.Capabilities {
		if c != "ui.manifest" {
			return false
		}
	}
	return true
}

// Remove stops the container, removes the DB record, and closes the gRPC connection.
func (m *Manager) Remove(ctx context.Context, pluginID string) error {
	// Refuse to remove the active IDP — there must always be one active IDP.
	if activeID, _ := m.store.GetSetting(ctx, activeIDPSettingKey); activeID == pluginID {
		return fmt.Errorf("remove plugin: %q is the active IDP; activate a different IDP plugin first", pluginID)
	}

	// Refuse to remove if another installed plugin depends on this one.
	if err := m.checkNoDependents(ctx, pluginID, false); err != nil {
		return fmt.Errorf("remove plugin: %w", err)
	}

	// Refuse to remove the last IDP plugin — at least one must remain installed.
	p, err := m.store.FindByID(ctx, pluginID)
	if err != nil {
		return fmt.Errorf("remove plugin: find: %w", err)
	}
	if p.Type == "idp" {
		all, err := m.store.ListAll(ctx)
		if err != nil {
			return fmt.Errorf("remove plugin: list: %w", err)
		}
		idpCount := 0
		for _, pl := range all {
			if pl.Type == "idp" {
				idpCount++
			}
		}
		if idpCount <= 1 {
			return fmt.Errorf("remove plugin: %q is the only identity provider; install another IDP plugin before removing this one", pluginID)
		}
	}

	m.setStatus(pluginID, domain.PluginStatusRemoving)

	_ = m.pool.Close(pluginID)
	if p.Image != "" {
		containerID := "kleff-" + pluginID
		if err := m.rt.Remove(ctx, containerID); err != nil {
			m.logger.Warn("plugin remove: container removal failed", "id", pluginID, "error", err)
		}
	}

	// Best-effort removal of companion containers.
	if manifest, err := m.registry.GetManifest(ctx, pluginID); err == nil && manifest != nil {
		m.removeCompanions(ctx, manifest)
	}

	if err := m.store.Delete(ctx, pluginID); err != nil {
		return fmt.Errorf("remove plugin: delete record: %w", err)
	}

	m.mu.Lock()
	delete(m.statuses, pluginID)
	delete(m.restarts, pluginID)
	m.mu.Unlock()

	m.clearCapabilities(pluginID) // also removes routes

	m.mu.Lock()
	if m.activeIDP == pluginID {
		m.activeIDP = ""
	}
	m.mu.Unlock()

	m.logger.Info("plugin removed", "id", pluginID)
	return nil
}

// Enable starts the container and re-opens the gRPC connection.
func (m *Manager) Enable(ctx context.Context, pluginID string) error {
	p, err := m.store.FindByID(ctx, pluginID)
	if err != nil {
		return fmt.Errorf("enable plugin: find: %w", err)
	}

	p.Enabled = true
	p.UpdatedAt = time.Now().UTC()
	if err := m.store.Save(ctx, p); err != nil {
		return fmt.Errorf("enable plugin: save: %w", err)
	}

	return m.ensureRunning(ctx, p)
}

// Disable stops the container and closes the gRPC connection.
func (m *Manager) Disable(ctx context.Context, pluginID string) error {
	// Refuse to disable the active IDP — there must always be one active IDP.
	if activeID, _ := m.store.GetSetting(ctx, activeIDPSettingKey); activeID == pluginID {
		return fmt.Errorf("disable plugin: %q is the active IDP; activate a different IDP plugin first", pluginID)
	}

	// Refuse to disable if an enabled plugin depends on this one.
	if err := m.checkNoDependents(ctx, pluginID, true); err != nil {
		return fmt.Errorf("disable plugin: %w", err)
	}

	p, err := m.store.FindByID(ctx, pluginID)
	if err != nil {
		return fmt.Errorf("disable plugin: find: %w", err)
	}

	_ = m.pool.Close(pluginID)

	if p.Image != "" {
		containerID := "kleff-" + pluginID
		if err := m.rt.Stop(ctx, containerID); err != nil {
			m.logger.Warn("plugin disable: stop failed", "id", pluginID, "error", err)
		}
	}

	p.Enabled = false
	p.UpdatedAt = time.Now().UTC()
	if err := m.store.Save(ctx, p); err != nil {
		return fmt.Errorf("disable plugin: save: %w", err)
	}

	m.setStatus(pluginID, domain.PluginStatusDisabled)
	m.clearCapabilities(pluginID)
	return nil
}

// Reconfigure restarts the container with updated config.
func (m *Manager) Reconfigure(ctx context.Context, pluginID string, config map[string]string) error {
	p, err := m.store.FindByID(ctx, pluginID)
	if err != nil {
		return fmt.Errorf("reconfigure plugin: find: %w", err)
	}

	// Fetch manifest to know which fields are secrets.
	manifest, err := m.registry.GetManifest(ctx, pluginID)
	if err != nil {
		return fmt.Errorf("reconfigure plugin: get manifest: %w", err)
	}

	plainCfg := map[string]string{}
	secretCfg := map[string]string{}
	if manifest != nil {
		for _, field := range manifest.Config {
			if val, ok := config[field.Key]; ok {
				if field.Type == "secret" {
					secretCfg[field.Key] = val
				} else {
					plainCfg[field.Key] = val
				}
			}
		}
	} else {
		plainCfg = config
	}

	configJSON, _ := json.Marshal(plainCfg)
	secretsJSON, err := m.encryptSecrets(secretCfg)
	if err != nil {
		return fmt.Errorf("reconfigure plugin: encrypt secrets: %w", err)
	}

	p.Config = configJSON
	p.Secrets = secretsJSON
	p.UpdatedAt = time.Now().UTC()

	if err := m.store.Save(ctx, p); err != nil {
		return fmt.Errorf("reconfigure plugin: save: %w", err)
	}

	// Tier 0: no container — config saved, nothing to restart.
	if p.Image == "" {
		return nil
	}

	// Tier 1 or 2: redeploy container with updated env vars.
	if p.GRPCAddr != "" {
		_ = m.pool.Close(pluginID)
	}
	spec, caCertPEM, err := m.buildSecureContainerSpec(p, manifest, config)
	if err != nil {
		return fmt.Errorf("reconfigure plugin: %w", err)
	}
	if err := m.rt.Deploy(ctx, spec); err != nil {
		return fmt.Errorf("reconfigure plugin: redeploy: %w", err)
	}
	m.mu.Lock()
	m.caCerts[p.ID] = caCertPEM
	m.mu.Unlock()
	if p.GRPCAddr != "" {
		return m.pool.Dial(ctx, p.ID, p.GRPCAddr, caCertPEM)
	}
	return nil
}

// GetPlugin returns the persisted plugin with its current in-memory status.
func (m *Manager) GetPlugin(ctx context.Context, pluginID string) (*domain.Plugin, error) {
	p, err := m.store.FindByID(ctx, pluginID)
	if err != nil {
		return nil, err
	}
	p.Status = m.getStatus(p.ID)
	return p, nil
}

// ListPlugins returns all installed plugins with in-memory statuses.
func (m *Manager) ListPlugins(ctx context.Context) ([]*domain.Plugin, error) {
	plugins, err := m.store.ListAll(ctx)
	if err != nil {
		return nil, err
	}
	for _, p := range plugins {
		p.Status = m.getStatus(p.ID)
	}
	return plugins, nil
}

// ── Identity (auth) ───────────────────────────────────────────────────────────

func (m *Manager) getActiveIDPProvider(ctx context.Context) (pluginsv1.IdentityProviderClient, error) {
	activeID, err := m.store.GetSetting(ctx, activeIDPSettingKey)
	if err != nil || activeID == "" {
		return nil, err
	}
	return m.pool.IDPProviderClient(activeID)
}

func (m *Manager) getActiveIDPFramework(ctx context.Context) (pluginsv1.IdentityFrameworkClient, error) {
	activeID, err := m.store.GetSetting(ctx, activeIDPSettingKey)
	if err != nil || activeID == "" {
		return nil, err
	}
	return m.pool.IDPFrameworkClient(activeID)
}

func (m *Manager) SetActiveIDP(ctx context.Context, pluginID string) error {
	// Capture the previous active IDP before switching.
	m.mu.RLock()
	prevIDP := m.activeIDP
	m.mu.RUnlock()

	if err := m.store.SetSetting(ctx, activeIDPSettingKey, pluginID); err != nil {
		return err
	}
	m.mu.Lock()
	m.activeIDP = pluginID
	m.mu.Unlock()

	// Ensure the newly active IDP is enabled and running.
	if newPlugin, err := m.store.FindByID(ctx, pluginID); err == nil {
		if !newPlugin.Enabled {
			newPlugin.Enabled = true
			newPlugin.UpdatedAt = time.Now().UTC()
			_ = m.store.Save(ctx, newPlugin)
		}
		if runErr := m.ensureRunning(ctx, newPlugin); runErr != nil {
			m.logger.Warn("SetActiveIDP: ensure new IDP running", "id", pluginID, "error", runErr)
		}
	}

	// Stop the previous IDP's containers when switching to a different plugin.
	// Named Docker volumes are preserved (ContainerRemove does not pass RemoveVolumes),
	// so all data (e.g. Keycloak realm, users) survives and is restored on re-activation.
	if prevIDP != "" && prevIDP != pluginID {
		// Mark old plugin disabled FIRST so the health loop does not instantly restart its containers
		// while we are in the middle of removing them.
		if oldPlugin, err := m.store.FindByID(ctx, prevIDP); err == nil {
			oldPlugin.Enabled = false
			oldPlugin.UpdatedAt = time.Now().UTC()
			if saveErr := m.store.Save(ctx, oldPlugin); saveErr != nil {
				m.logger.Warn("SetActiveIDP: save old plugin disabled", "id", prevIDP, "error", saveErr)
			}
		}
		m.setStatus(prevIDP, domain.PluginStatusDisabled)

		_ = m.pool.Close(prevIDP)

		cleanupCtx := context.Background() // Detach to ensure teardown completes even if request cancels
		if err := m.rt.Remove(cleanupCtx, "kleff-"+prevIDP); err != nil {
			m.logger.Warn("SetActiveIDP: remove old IDP container", "id", prevIDP, "error", err)
		}

		// Remove companion containers (e.g. Keycloak server) for the old IDP.
		if manifest, err := m.registry.GetManifest(ctx, prevIDP); err == nil && manifest != nil {
			for _, c := range manifest.Companions {
				if stopErr := m.rt.Remove(cleanupCtx, c.ID); stopErr != nil {
					m.logger.Warn("SetActiveIDP: remove old companion", "companion", c.ID, "plugin", prevIDP, "error", stopErr)
				}
			}
		}

		m.clearCapabilities(prevIDP)
		m.logger.Info("SetActiveIDP: stopped and removed previous IDP", "previous", prevIDP, "active", pluginID)
	}

	return nil
}

func (m *Manager) GetActiveIDPID() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.activeIDP
}

func (m *Manager) ValidateToken(ctx context.Context, token string) (*pluginsv1.TokenClaims, error) {
	idp, err := m.getActiveIDPProvider(ctx)
	if err != nil {
		return nil, fmt.Errorf("validate token: %w", err)
	}
	if idp == nil {
		return nil, fmt.Errorf("no active IDP plugin")
	}
	resp, err := idp.ValidateToken(ctx, &pluginsv1.ValidateTokenRequest{Token: token})
	if err != nil {
		return nil, fmt.Errorf("validate token: %w", err)
	}
	if e := pluginsv1.ProtoErrorToPluginError(resp.GetError()); e != nil {
		return nil, e
	}
	return resp.GetClaims(), nil
}

func (m *Manager) Login(ctx context.Context, username, password string) (*pluginsv1.TokenSet, error) {
	idp, err := m.getActiveIDPProvider(ctx)
	if err != nil {
		return nil, fmt.Errorf("login: %w", err)
	}
	if idp == nil {
		return nil, fmt.Errorf("no active IDP plugin")
	}
	resp, err := idp.Login(ctx, &pluginsv1.LoginRequest{Username: username, Password: password})
	if err != nil {
		return nil, fmt.Errorf("login: %w", err)
	}
	if e := pluginsv1.ProtoErrorToPluginError(resp.GetError()); e != nil {
		return nil, e
	}
	return resp.GetToken(), nil
}

func (m *Manager) Register(ctx context.Context, req *pluginsv1.RegisterRequest) (string, error) {
	idp, err := m.getActiveIDPProvider(ctx)
	if err != nil {
		return "", fmt.Errorf("register: %w", err)
	}
	if idp == nil {
		return "", fmt.Errorf("no active IDP plugin")
	}
	resp, err := idp.Register(ctx, req)
	if err != nil {
		return "", fmt.Errorf("register: %w", err)
	}
	if e := pluginsv1.ProtoErrorToPluginError(resp.GetError()); e != nil {
		return "", e
	}
	return resp.GetUserId(), nil
}

func (m *Manager) GetOIDCConfig(ctx context.Context) (*pluginsv1.OIDCConfig, error) {
	idp, err := m.getActiveIDPProvider(ctx)
	if err != nil || idp == nil {
		return nil, err
	}
	resp, err := idp.GetOIDCConfig(ctx, &pluginsv1.GetOIDCConfigRequest{})
	if err != nil {
		return nil, fmt.Errorf("get OIDC config: %w", err)
	}
	if e := pluginsv1.ProtoErrorToPluginError(resp.GetError()); e != nil {
		return nil, e
	}
	return resp.GetConfig(), nil
}

func (m *Manager) RefreshToken(ctx context.Context, refreshToken string) (*pluginsv1.TokenSet, error) {
	idp, err := m.getActiveIDPProvider(ctx)
	if err != nil {
		return nil, fmt.Errorf("refresh token: %w", err)
	}
	if idp == nil {
		return nil, fmt.Errorf("no active IDP plugin")
	}
	resp, err := idp.RefreshToken(ctx, &pluginsv1.RefreshTokenRequest{RefreshToken: refreshToken})
	if err != nil {
		return nil, fmt.Errorf("refresh token: %w", err)
	}
	if e := pluginsv1.ProtoErrorToPluginError(resp.GetError()); e != nil {
		return nil, e
	}
	return resp.GetToken(), nil
}

func (m *Manager) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	idp, err := m.getActiveIDPFramework(ctx)
	if err != nil {
		return fmt.Errorf("change password: %w", err)
	}
	if idp == nil {
		return fmt.Errorf("no active IDP plugin")
	}
	resp, err := idp.ChangePassword(ctx, &pluginsv1.ChangePasswordRequest{
		UserId:          userID,
		CurrentPassword: currentPassword,
		NewPassword:     newPassword,
	})
	if err != nil {
		return fmt.Errorf("change password: %w", err)
	}
	if e := pluginsv1.ProtoErrorToPluginError(resp.GetError()); e != nil {
		return e
	}
	return nil
}

func (m *Manager) ListSessions(ctx context.Context, userID, currentSessionID string) ([]*pluginsv1.Session, error) {
	idp, err := m.getActiveIDPFramework(ctx)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	if idp == nil {
		return nil, fmt.Errorf("no active IDP plugin")
	}
	resp, err := idp.ListSessions(ctx, &pluginsv1.ListSessionsRequest{
		UserId:           userID,
		CurrentSessionId: currentSessionID,
	})
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	if e := pluginsv1.ProtoErrorToPluginError(resp.GetError()); e != nil {
		return nil, e
	}
	if sl := resp.GetSessions(); sl != nil {
		return sl.GetItems(), nil
	}
	return nil, nil
}

func (m *Manager) RevokeAllSessions(ctx context.Context, userID, currentSessionID string) error {
	sessions, err := m.ListSessions(ctx, userID, currentSessionID)
	if err != nil {
		return fmt.Errorf("revoke all sessions: list: %w", err)
	}
	var errs []string
	for _, s := range sessions {
		if s.GetId() == currentSessionID {
			continue
		}
		if err := m.RevokeSession(ctx, userID, s.GetId()); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", s.GetId(), err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("revoke all sessions: some failed: %s", strings.Join(errs, "; "))
	}
	return nil
}

func (m *Manager) RevokeSession(ctx context.Context, userID, sessionID string) error {
	idp, err := m.getActiveIDPFramework(ctx)
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	if idp == nil {
		return fmt.Errorf("no active IDP plugin")
	}
	resp, err := idp.RevokeSession(ctx, &pluginsv1.RevokeSessionRequest{
		UserId:    userID,
		SessionId: sessionID,
	})
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	if e := pluginsv1.ProtoErrorToPluginError(resp.GetError()); e != nil {
		return e
	}
	return nil
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func (m *Manager) ensureRunning(ctx context.Context, p *domain.Plugin) error {
	// Fetch manifest once — used for companion deployment and default env injection.
	var manifest *domain.CatalogManifest
	if mf, err := m.registry.GetManifest(ctx, p.ID); err == nil && mf != nil {
		manifest = mf
	}

	// Ensure companion containers (e.g. Keycloak server) are running first.
	if manifest != nil {
		secrets, _ := m.decryptSecrets(p.Secrets)
		cfg := mergeConfig(p.Config, secrets)
		if err := m.deployCompanions(ctx, manifest, cfg); err != nil {
			m.logger.Warn("ensureRunning: companion deploy failed", "plugin", p.ID, "error", err)
		}
	}

	containerID := "kleff-" + p.ID
	st, err := m.rt.Status(ctx, containerID)
	if err != nil {
		return fmt.Errorf("status check: %w", err)
	}

	m.mu.RLock()
	caCertPEM := m.caCerts[p.ID]
	m.mu.RUnlock()

	// Redeploy if the container isn't running, or if we have no CA cert for a
	// connection we need to establish (e.g. after a platform restart).
	needDeploy := (st.State != runtime.StateRunning && p.Image != "" && !strings.HasPrefix(p.Image, ":")) ||
		(len(caCertPEM) == 0 && p.GRPCAddr != "" && !m.pool.HasConnection(p.ID))
	if needDeploy {
		// Decode secrets for env injection.
		secrets, _ := m.decryptSecrets(p.Secrets)
		allConfig := mergeConfig(p.Config, secrets)

		// Apply manifest defaults for any key not already in config.
		// This ensures internal/bootstrap env vars reach the plugin container
		// even when they were not stored at install time.
		if manifest != nil {
			for _, field := range manifest.Config {
				if _, ok := allConfig[field.Key]; !ok && field.Default != "" {
					allConfig[field.Key] = field.Default
				}
			}
			m.resolveCapabilityFields(ctx, manifest, allConfig)
		}

		spec, newCA, err := m.buildSecureContainerSpec(p, manifest, allConfig)
		if err != nil {
			return fmt.Errorf("ensureRunning: %w", err)
		}
		if err := m.rt.Deploy(ctx, spec); err != nil {
			return fmt.Errorf("deploy: %w", err)
		}
		m.mu.Lock()
		m.caCerts[p.ID] = newCA
		m.mu.Unlock()
		caCertPEM = newCA
	}

	// Tier 2: dial gRPC and discover capabilities dynamically.
	// Tier 1: capabilities come from the manifest directly.
	if p.GRPCAddr != "" {
		if !m.pool.HasConnection(p.ID) {
			if err := m.pool.Dial(ctx, p.ID, p.GRPCAddr, caCertPEM); err != nil {
				return fmt.Errorf("dial gRPC: %w", err)
			}
		}
		m.discoverCapabilities(context.Background(), p.ID)
	} else if manifest != nil {
		caps := make(map[string]bool, len(manifest.Capabilities))
		for _, c := range manifest.Capabilities {
			caps[c] = true
		}
		m.mu.Lock()
		m.capabilities[p.ID] = caps
		m.mu.Unlock()
	}

	m.setStatus(p.ID, domain.PluginStatusRunning)
	return nil
}

// buildSecureContainerSpec generates an ephemeral mTLS cert pair and returns
// the ready-to-deploy ContainerSpec plus the CA PEM. The caller is responsible
// for storing the CA in m.caCerts only after a successful Deploy, to prevent
// overwriting a valid CA when a concurrent deploy attempt fails (e.g. "Conflict").
func (m *Manager) buildSecureContainerSpec(p *domain.Plugin, manifest *domain.CatalogManifest, config map[string]string) (runtime.ContainerSpec, []byte, error) {
	caCertPEM, certPEM, keyPEM, err := generatePluginTLS(p.ID)
	if err != nil {
		return runtime.ContainerSpec{}, nil, fmt.Errorf("generate TLS certs: %w", err)
	}
	return m.buildContainerSpec(p, manifest, config, certPEM, keyPEM), caCertPEM, nil
}

func (m *Manager) buildContainerSpec(p *domain.Plugin, manifest *domain.CatalogManifest, config map[string]string, certPEM, keyPEM []byte) runtime.ContainerSpec {
	env := make(map[string]string, len(m.companionEnv)+len(config)+2)
	for k, v := range m.companionEnv {
		env[k] = v
	}
	for k, v := range config {
		if v != "" {
			env[k] = v
		}
	}
	env["PLUGIN_ID"] = p.ID
	env["PLUGIN_PORT"] = fmt.Sprintf("%d", grpcPort)
	if len(certPEM) > 0 && len(keyPEM) > 0 {
		env["PLUGIN_TLS_CERT_PEM"] = string(certPEM)
		env["PLUGIN_TLS_KEY_PEM"] = string(keyPEM)
	}

	labels := map[string]string{
		"kleff.io/managed":           "true",
		"kleff.io/plugin-id":         p.ID,
		"kleff.io/type":              p.Type,
		"com.docker.compose.project": m.projectName,
		"com.docker.compose.service": p.ID,
	}

	var volumes []runtime.VolumeMount
	if manifest != nil {
		for _, v := range manifest.Volumes {
			volumes = append(volumes, runtime.VolumeMount{
				Name:     v.Name,
				Target:   v.Target,
				HostPath: v.HostPath,
				ReadOnly: v.ReadOnly,
			})
		}
	}

	var ports []runtime.PortMapping
	if p.GRPCAddr != "" {
		// Tier 2: inject gRPC identity env vars and expose the gRPC port.
		env["PLUGIN_ID"] = p.ID
		env["PLUGIN_PORT"] = fmt.Sprintf("%d", grpcPort)
		ports = append(ports, runtime.PortMapping{ContainerPort: grpcPort, Protocol: "tcp"})
	}
	if p.Type == "ui" {
		ports = append(ports, runtime.PortMapping{ContainerPort: 3001, HostPort: 3001, Protocol: "tcp"})
	}
	// Tier 1: use ports declared in the manifest (e.g. Grafana :3000).
	if manifest != nil {
		for _, mp := range manifest.Ports {
			proto := mp.Protocol
			if proto == "" {
				proto = "tcp"
			}
			ports = append(ports, runtime.PortMapping{
				ContainerPort: mp.ContainerPort,
				HostPort:      mp.HostPort,
				Protocol:      proto,
			})
		}
	}

	privileged := manifest != nil && manifest.Privileged
	var command []string
	if manifest != nil {
		command = manifest.Command
	}
	return runtime.ContainerSpec{
		ID:            "kleff-" + p.ID,
		Image:         p.Image,
		Command:       command,
		Env:           env,
		Ports:         ports,
		Labels:        labels,
		Volumes:       volumes,
		RestartPolicy: runtime.RestartAlways,
		Privileged:    privileged,
	}
}

// healthLoop runs the 30-second health-check background goroutine.
func (m *Manager) healthLoop(ctx context.Context) {
	ticker := time.NewTicker(healthCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.runHealthChecks(ctx)
		}
	}
}

func (m *Manager) runHealthChecks(ctx context.Context) {
	plugins, err := m.store.ListAll(ctx)
	if err != nil {
		m.logger.Error("health check: list plugins", "error", err)
		return
	}

	for _, p := range plugins {
		if !p.Enabled {
			continue
		}
		m.checkPlugin(ctx, p)
	}
}

func (m *Manager) checkPlugin(ctx context.Context, p *domain.Plugin) {
	// Tier 0: no container — always healthy.
	if p.Image == "" {
		m.setStatus(p.ID, domain.PluginStatusRunning)
		return
	}

	// Skip health check if the plugin is currently being removed or disabled
	currentStatus := m.getStatus(p.ID)
	if currentStatus == domain.PluginStatusRemoving || currentStatus == domain.PluginStatusDisabled {
		return
	}

	containerID := "kleff-" + p.ID
	st, err := m.rt.Status(ctx, containerID)
	if err != nil || st.State != runtime.StateRunning {
		attempts := m.getRestarts(p.ID)
		if attempts >= maxRestartAttempts {
			m.setStatus(p.ID, domain.PluginStatusError)
			m.logger.Error("plugin health: max restart attempts reached", "id", p.ID)
			return
		}

		m.logger.Warn("plugin health: container not running, attempting restart",
			"id", p.ID, "attempts", attempts+1)

		secrets, _ := m.decryptSecrets(p.Secrets)
		allConfig := mergeConfig(p.Config, secrets)
		var checkManifest *domain.CatalogManifest
		if mf, err := m.registry.GetManifest(ctx, p.ID); err == nil && mf != nil {
			checkManifest = mf
			for _, field := range mf.Config {
				if _, ok := allConfig[field.Key]; !ok && field.Default != "" {
					allConfig[field.Key] = field.Default
				}
			}
			m.resolveCapabilityFields(ctx, checkManifest, allConfig)
		}
		spec, newCA, err := m.buildSecureContainerSpec(p, checkManifest, allConfig)
		if err != nil {
			m.logger.Warn("healthLoop: build secure spec failed", "plugin", p.ID, "error", err)
			m.incrementRestarts(p.ID)
			m.setStatus(p.ID, domain.PluginStatusError)
			return
		}

		if checkManifest != nil {
			if compErr := m.deployCompanions(ctx, checkManifest, allConfig); compErr != nil {
				m.logger.Warn("plugin health: companion deploy failed", "id", p.ID, "error", compErr)
			}
		}

		if restartErr := m.rt.Deploy(ctx, spec); restartErr != nil {
			m.incrementRestarts(p.ID)
			m.setStatus(p.ID, domain.PluginStatusError)
			return
		}
		// Store CA only after the container is successfully deployed with this cert.
		m.mu.Lock()
		m.caCerts[p.ID] = newCA
		m.mu.Unlock()
		// Tier 1: no gRPC to redial.
		if p.GRPCAddr != "" {
			if dialErr := m.pool.Dial(ctx, p.ID, p.GRPCAddr, newCA); dialErr != nil {
				m.incrementRestarts(p.ID)
				m.setStatus(p.ID, domain.PluginStatusError)
				return
			}
		}
		m.resetRestarts(p.ID)
		m.setStatus(p.ID, domain.PluginStatusRunning)
		return
	}

	// Tier 1: container is running, no gRPC health check needed.
	if p.GRPCAddr == "" {
		m.resetRestarts(p.ID)
		m.setStatus(p.ID, domain.PluginStatusRunning)
		return
	}

	// Tier 2: container is running — check gRPC health.
	hc, err := m.pool.HealthClient(p.ID)
	if err != nil {
		m.mu.RLock()
		reconnCA := m.caCerts[p.ID]
		m.mu.RUnlock()
		if dialErr := m.pool.Dial(ctx, p.ID, p.GRPCAddr, reconnCA); dialErr != nil {
			m.setStatus(p.ID, domain.PluginStatusError)
			return
		}
		hc, err = m.pool.HealthClient(p.ID)
		if err != nil {
			m.setStatus(p.ID, domain.PluginStatusError)
			return
		}
	}

	hCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	resp, err := hc.Health(hCtx, &pluginsv1.HealthRequest{})
	if err != nil {
		// Close the stale connection so the next tick re-dials via the reconnect
		// path above (HealthClient returns an error → reconnect with cached CA).
		_ = m.pool.Close(p.ID)
		m.setStatus(p.ID, domain.PluginStatusError)
		return
	}

	switch resp.Status {
	case pluginsv1.HealthStatusHealthy:
		m.resetRestarts(p.ID)
		m.setStatus(p.ID, domain.PluginStatusRunning)

		// If capabilities missed during install, retry collecting them.
		m.mu.RLock()
		missingCaps := len(m.capabilities[p.ID]) == 0
		m.mu.RUnlock()
		if missingCaps {
			m.discoverCapabilities(ctx, p.ID)
		}

	case pluginsv1.HealthStatusDegraded:
		m.setStatus(p.ID, domain.PluginStatusRunning) // degraded but still serving
	default:
		m.setStatus(p.ID, domain.PluginStatusError)
	}
}

// ── Capability extension points ───────────────────────────────────────────────

// discoverCapabilities calls GetCapabilities on the plugin and caches the result.
// Non-fatal: if the call fails the plugin is treated as having no capabilities.
func (m *Manager) discoverCapabilities(ctx context.Context, id string) {
	hc, err := m.pool.HealthClient(id)
	if err != nil {
		return
	}
	capCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	resp, err := hc.GetCapabilities(capCtx, &pluginsv1.GetCapabilitiesRequest{}, grpc.WaitForReady(true))
	if err != nil {
		m.logger.Debug("plugin capabilities: GetCapabilities failed (no capabilities assumed)",
			"plugin", id, "error", err)
		return
	}

	caps := make(map[string]bool, len(resp.Capabilities))
	for _, c := range resp.Capabilities {
		caps[c] = true
	}

	// Enforce tag-based permissions: strip any capability the plugin's manifest
	// tags do not permit. Plugins with no layer tags are unrestricted (nil).
	if manifest, err := m.registry.GetManifest(ctx, id); err == nil && manifest != nil {
		if permitted := permittedCapabilities(manifest.Tags); permitted != nil {
			for c := range caps {
				if !permitted[c] {
					m.logger.Warn("plugin capability denied by tag permissions",
						"plugin", id, "capability", c)
					delete(caps, c)
				}
			}
		}
	}

	m.mu.Lock()
	m.capabilities[id] = caps
	m.mu.Unlock()

	m.logger.Debug("plugin capabilities discovered", "plugin", id, "capabilities", resp.Capabilities)

	// If the plugin owns HTTP routes, fetch and register them now.
	if caps[pluginsv1.CapabilityAPIRoutes] {
		m.discoverRoutes(ctx, id)
	}

	// Re-resolve capability fields for other running plugins that depend on the
	// capabilities this plugin just advertised. Fixes install-order issues where
	// a collector (e.g. Alloy) is deployed before its backend (e.g. VictoriaMetrics)
	// and gets an empty resolved field.
	go m.reResolveCapabilityDependents(context.Background(), id)
}

func (m *Manager) clearCapabilities(id string) {
	m.mu.Lock()
	delete(m.capabilities, id)
	// Remove all routes registered by this plugin.
	filtered := m.routes[:0]
	for _, r := range m.routes {
		if r.pluginID != id {
			filtered = append(filtered, r)
		}
	}
	m.routes = filtered
	m.mu.Unlock()
}

// HasIdentityProvider reports whether an IDP plugin has been configured.
// It returns true as soon as SetActiveIDP is called — before capability discovery
// completes — so the frontend doesn't redirect back to setup while the plugin starts.
func (m *Manager) HasIdentityProvider() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.activeIDP != "" {
		return true
	}
	for id := range m.capabilities {
		if m.capabilities[id][pluginsv1.CapabilityIdentityProvider] {
			return true
		}
	}
	return false
}

// IDPReady reports whether the active IDP plugin has completed capability discovery.
// This is used to gate the frontend login page — returning false means the plugin
// container is starting up and the caller should show a loading state.
func (m *Manager) IDPReady() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.activeIDP == "" {
		return false
	}
	caps, ok := m.capabilities[m.activeIDP]
	return ok && caps[pluginsv1.CapabilityIdentityProvider]
}

// discoverRoutes calls GetRoutes on a plugin and registers them in the route table.
func (m *Manager) discoverRoutes(ctx context.Context, id string) {
	hc, err := m.pool.APIRoutesClient(id)
	if err != nil {
		return
	}
	rCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	resp, err := hc.GetRoutes(rCtx, &pluginsv1.GetRoutesRequest{})
	if err != nil || resp.GetError() != nil {
		m.logger.Warn("plugin routes: GetRoutes failed", "plugin", id, "error", err)
		return
	}

	m.mu.Lock()
	// Remove any previously registered routes for this plugin.
	filtered := m.routes[:0]
	for _, r := range m.routes {
		if r.pluginID != id {
			filtered = append(filtered, r)
		}
	}
	for _, r := range resp.GetRoutes().GetItems() {
		filtered = append(filtered, pluginRoute{
			pluginID: id,
			method:   r.GetMethod(),
			path:     r.GetPattern(),
		})
	}
	m.routes = filtered
	m.mu.Unlock()

	m.logger.Info("plugin routes registered", "plugin", id, "count", len(resp.GetRoutes().GetItems()))
}

// MatchPluginRoute returns the plugin ID and public flag for the first route
// that matches the given method and path, or ok=false if none match.
func (m *Manager) MatchPluginRoute(method, path string) (pluginID string, public bool, ok bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, r := range m.routes {
		if !routeMethodMatches(r.method, method) {
			continue
		}
		if routePathMatches(r.path, path) {
			return r.pluginID, r.public, true
		}
	}
	return "", false, false
}

// HandlePluginRoute forwards an HTTP request to the plugin's Handle gRPC method.
func (m *Manager) HandlePluginRoute(ctx context.Context, pluginID string, req *pluginsv1.HandleHTTPRequest) (*pluginsv1.HandleHTTPResponse, error) {
	hc, err := m.pool.APIRoutesClient(pluginID)
	if err != nil {
		return nil, fmt.Errorf("plugin route: no client for %q: %w", pluginID, err)
	}
	resp, err := hc.Handle(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("plugin route: Handle gRPC: %w", err)
	}
	return resp, nil
}

func routeMethodMatches(pattern, method string) bool {
	return pattern == "*" || pattern == method
}

func routePathMatches(pattern, path string) bool {
	if strings.HasSuffix(pattern, "*") {
		return strings.HasPrefix(path, pattern[:len(pattern)-1])
	}
	return pattern == path
}

// RunMiddleware fans out OnRequest to all plugins that declared CapabilityAPIMiddleware.
// RunMiddleware fans out OnRequest to all plugins that declared CapabilityAPIMiddleware.
// The platform has already validated the token; userID and roles are the verified identity.
// Returns a non-nil error if any plugin denies the request.
func (m *Manager) RunMiddleware(ctx context.Context, userID string, roles []string, method, path string) error {
	m.mu.RLock()
	var middlewarePlugins []string
	for id, caps := range m.capabilities {
		if caps[pluginsv1.CapabilityAPIMiddleware] {
			middlewarePlugins = append(middlewarePlugins, id)
		}
	}
	m.mu.RUnlock()

	if len(middlewarePlugins) == 0 {
		return nil
	}

	req := &pluginsv1.MiddlewareRequest{
		UserId: userID,
		Roles:  roles,
		Method: method,
		Path:   path,
	}

	for _, id := range middlewarePlugins {
		mc, err := m.pool.MiddlewareClient(id)
		if err != nil {
			m.logger.Warn("plugin middleware: no client", "plugin", id, "error", err)
			continue
		}
		resp, err := mc.OnRequest(ctx, req)
		if err != nil {
			m.logger.Warn("plugin middleware: OnRequest error", "plugin", id, "error", err)
			continue // treat gRPC errors as non-blocking
		}
		if !resp.Allow {
			msg := "forbidden by plugin"
			if resp.GetDenyReason() != "" {
				msg = resp.GetDenyReason()
			}
			return fmt.Errorf("%s", msg)
		}
	}
	return nil
}

// GetUIManifests collects UIManifest from every plugin that declared CapabilityUIManifest.
func (m *Manager) GetUIManifests(ctx context.Context) ([]*pluginsv1.UIManifest, error) {
	m.mu.RLock()
	var uiPlugins []string
	for id, caps := range m.capabilities {
		if caps[pluginsv1.CapabilityUIManifest] {
			uiPlugins = append(uiPlugins, id)
		}
	}
	m.mu.RUnlock()

	var manifests []*pluginsv1.UIManifest
	for _, id := range uiPlugins {
		uc, err := m.pool.UIClient(id)
		if err != nil {
			continue
		}
		resp, err := uc.GetUIManifest(ctx, &pluginsv1.GetUIManifestRequest{})
		if err != nil || resp.GetError() != nil {
			m.logger.Warn("plugin UI: GetUIManifest error", "plugin", id, "error", err)
			continue
		}
		if resp.GetManifest() != nil {
			resp.GetManifest().PluginId = id
			manifests = append(manifests, resp.GetManifest())
		}
	}
	return manifests, nil
}

// ── Companion container management ───────────────────────────────────────────

// deployCompanions starts companion containers declared in the plugin manifest.
// Only deploys a companion if it is not already running (idempotent).
// pluginConfig is the merged plain+secret config for the plugin; companions
// with SkipIfEnv set are skipped when the user supplied that config key.
func (m *Manager) deployCompanions(ctx context.Context, manifest *domain.CatalogManifest, pluginConfig map[string]string) error {
	for _, c := range manifest.Companions {
		if c.SkipIfEnv != "" && pluginConfig[c.SkipIfEnv] != "" {
			m.logger.Info("companion skipped: user provided external service",
				"companion", c.ID, "plugin", manifest.ID, "key", c.SkipIfEnv)
			continue
		}

		st, _ := m.rt.Status(ctx, c.ID)
		if st.State == runtime.StateRunning {
			continue
		}

		volumes := make([]runtime.VolumeMount, 0, len(c.Volumes))
		for _, v := range c.Volumes {
			volumes = append(volumes, runtime.VolumeMount{
				Name:     v.Name,
				Target:   v.Target,
				HostPath: v.HostPath,
				ReadOnly: v.ReadOnly,
			})
		}

		ports := make([]runtime.PortMapping, 0, len(c.Ports))
		for _, p := range c.Ports {
			proto := p.Protocol
			if proto == "" {
				proto = "tcp"
			}
			ports = append(ports, runtime.PortMapping{
				ContainerPort: p.ContainerPort,
				HostPort:      p.HostPort,
				Protocol:      proto,
			})
		}

		// Merge global companion env (lower priority) with manifest env (higher priority).
		env := make(map[string]string, len(m.companionEnv)+len(c.Env)+len(pluginConfig))
		for k, v := range m.companionEnv {
			env[k] = v
		}
		// Substitute ${VAR} placeholders in companion env values using plugin config.
		for k, v := range c.Env {
			env[k] = substituteEnvVarsStr(v, pluginConfig)
		}
		// Merge dynamic user configurations (highest priority).
		for k, v := range pluginConfig {
			env[k] = v
		}

		spec := runtime.ContainerSpec{
			ID:         c.ID,
			Image:      c.Image,
			Entrypoint: c.Entrypoint,
			Command:    c.Command,
			Env:        env,
			Ports:      ports,
			Volumes:    volumes,
			User:       c.User,
			Labels: map[string]string{
				"kleff.io/managed":           "true",
				"kleff.io/plugin-id":         manifest.ID,
				"kleff.io/companion":         "true",
				"com.docker.compose.project": m.projectName,
				"com.docker.compose.service": c.ID,
			},
			RestartPolicy: runtime.RestartAlways,
		}
		// Block until the declared TCP dependency is reachable.
		if c.WaitForTCP != "" {
			if err := m.waitForTCP(ctx, c.WaitForTCP); err != nil {
				return fmt.Errorf("companion %q: wait for TCP %q: %w", c.ID, c.WaitForTCP, err)
			}
		}

		if err := m.rt.Deploy(ctx, spec); err != nil {
			return fmt.Errorf("companion %q: %w", c.ID, err)
		}
		m.logger.Info("companion deployed", "companion", c.ID, "plugin", manifest.ID)
	}
	return nil
}

// waitForTCP polls addr ("host:port") until it accepts a TCP connection or the
// context is cancelled. It retries every second for up to 2 minutes.
// Progress is logged every 5 attempts to avoid flooding the log.
func (m *Manager) waitForTCP(ctx context.Context, addr string) error {
	const (
		dialTimeout = time.Second
		retryDelay  = time.Second
		maxWait     = 2 * time.Minute
		logEvery    = 5 // log every N attempts
	)
	deadline := time.Now().Add(maxWait)
	for attempt := 1; ; attempt++ {
		conn, err := net.DialTimeout("tcp", addr, dialTimeout)
		if err == nil {
			conn.Close()
			m.logger.Info("TCP dependency ready", "addr", addr, "attempts", attempt)
			return nil
		}
		if attempt%logEvery == 0 {
			m.logger.Info("waiting for TCP dependency", "addr", addr, "attempts", attempt)
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out after %s waiting for %s to accept connections", maxWait, addr)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(retryDelay):
		}
	}
}

// removeCompanions stops and removes companion containers declared in the manifest.
func (m *Manager) removeCompanions(ctx context.Context, manifest *domain.CatalogManifest) {
	for _, c := range manifest.Companions {
		if err := m.rt.Remove(ctx, c.ID); err != nil {
			m.logger.Warn("companion remove failed", "companion", c.ID, "plugin", manifest.ID, "error", err)
		} else {
			m.logger.Info("companion removed", "companion", c.ID, "plugin", manifest.ID)
		}
	}
}

// ── Observability ─────────────────────────────────────────────────────────────

// IngestWorkloadMetrics finds the active monitoring.metrics plugin and writes
// the sample directly to its VictoriaMetrics companion via HTTP, bypassing gRPC
// (the monitoring gRPC types use plain Go structs that don't satisfy proto.Message).
func (m *Manager) IngestWorkloadMetrics(ctx context.Context, sample *pluginsv1.MetricSample) error {
	backendURL, err := m.GetMetricsBackendURL(ctx)
	if err != nil || backendURL == "" {
		return nil // no metrics backend configured — silently drop
	}

	ts := sample.Timestamp * 1000 // VictoriaMetrics expects milliseconds
	labels := fmt.Sprintf(
		`workload_id=%q,workload_name=%q,node_id=%q,org_id=%q,project_id=%q`,
		sample.WorkloadID, sample.WorkloadName, sample.NodeID, sample.OrgID, sample.ProjectID,
	)

	var sb strings.Builder
	if sample.CPUMillicores > 0 {
		fmt.Fprintf(&sb, "kleff_workload_cpu_millicores{%s} %d %d\n", labels, sample.CPUMillicores, ts)
	}
	if sample.MemoryMB > 0 {
		fmt.Fprintf(&sb, "kleff_workload_memory_mb{%s} %d %d\n", labels, sample.MemoryMB, ts)
	}
	if sample.NetworkRxMB > 0 {
		fmt.Fprintf(&sb, "kleff_workload_network_rx_mb{%s} %g %d\n", labels, sample.NetworkRxMB, ts)
	}
	if sample.NetworkTxMB > 0 {
		fmt.Fprintf(&sb, "kleff_workload_network_tx_mb{%s} %g %d\n", labels, sample.NetworkTxMB, ts)
	}
	if sample.DiskReadMB > 0 {
		fmt.Fprintf(&sb, "kleff_workload_disk_read_mb{%s} %g %d\n", labels, sample.DiskReadMB, ts)
	}
	if sample.DiskWriteMB > 0 {
		fmt.Fprintf(&sb, "kleff_workload_disk_write_mb{%s} %g %d\n", labels, sample.DiskWriteMB, ts)
	}

	body := sb.String()
	if body == "" {
		return nil
	}

	url := strings.TrimRight(backendURL, "/") + "/api/v1/import/prometheus"
	callCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewBufferString(body))
	if err != nil {
		return fmt.Errorf("ingest metrics: build request: %w", err)
	}
	req.Header.Set("Content-Type", "text/plain")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("ingest metrics: post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("ingest metrics: unexpected status %d", resp.StatusCode)
	}
	return nil
}

// GetMetricsBackendURL returns the PromQL-compatible query base URL of the
// active metrics backend plugin's time-series backend (e.g. VictoriaMetrics).
// It finds the companion with InternalAddr set on the monitoring.metrics plugin.
func (m *Manager) GetMetricsBackendURL(ctx context.Context) (string, error) {
	m.mu.RLock()
	var frameworkID string
	for id, caps := range m.capabilities {
		if caps[pluginsv1.CapabilityMonitoringMetrics] {
			frameworkID = id
			break
		}
	}
	m.mu.RUnlock()

	if frameworkID == "" {
		return "", nil
	}

	manifest, err := m.registry.GetManifest(ctx, frameworkID)
	if err != nil || manifest == nil {
		return "", nil
	}
	for _, c := range manifest.Companions {
		if c.InternalAddr != "" {
			return c.InternalAddr, nil
		}
	}
	return "", nil
}

// GetLogsBackendURL returns the LogQL-compatible query URL of the active
// monitoring.logs plugin's log store (e.g. Loki).
func (m *Manager) GetLogsBackendURL(ctx context.Context) (string, error) {
	m.mu.RLock()
	var logsID string
	for id, caps := range m.capabilities {
		if caps[pluginsv1.CapabilityMonitoringLogs] {
			logsID = id
			break
		}
	}
	m.mu.RUnlock()

	if logsID == "" {
		return "", nil
	}

	manifest, err := m.registry.GetManifest(ctx, logsID)
	if err != nil || manifest == nil {
		return "", nil
	}
	for _, c := range manifest.Companions {
		if c.InternalAddr != "" {
			return c.InternalAddr, nil
		}
	}
	return "", nil
}

// GetScrapeTargets aggregates scrape targets from all active monitoring.source plugins.
// For plugins with a static Scrape config in their manifest, no gRPC call is made.
// For plugins without one, GetScrapeTargets() gRPC is called.
func (m *Manager) GetScrapeTargets(ctx context.Context) ([]*pluginsv1.ScrapeTarget, error) {
	m.mu.RLock()
	var sourceIDs []string
	for id, caps := range m.capabilities {
		if caps[pluginsv1.CapabilityMonitoringSource] {
			sourceIDs = append(sourceIDs, id)
		}
	}
	m.mu.RUnlock()

	var targets []*pluginsv1.ScrapeTarget
	for _, id := range sourceIDs {
		manifest, err := m.registry.GetManifest(ctx, id)
		if err != nil || manifest == nil {
			continue
		}
		if manifest.Scrape != nil {
			// Static scrape config — build target from manifest, no gRPC needed.
			path := manifest.Scrape.Path
			if path == "" {
				path = "/metrics"
			}
			scheme := manifest.Scrape.Scheme
			if scheme == "" {
				scheme = "http"
			}
			targets = append(targets, &pluginsv1.ScrapeTarget{
				Address:     fmt.Sprintf("kleff-%s:%d", id, manifest.Scrape.Port),
				MetricsPath: path,
				Scheme:      scheme,
				Labels:      map[string]string{"kleff_plugin_id": id},
			})
			continue
		}
		// Dynamic scrape targets via gRPC.
		client, err := m.pool.MonitoringSourceClient(id)
		if err != nil {
			continue
		}
		callCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		resp, err := client.GetScrapeTargets(callCtx, &pluginsv1.GetScrapeTargetsRequest{})
		cancel()
		if err != nil {
			continue
		}
		targets = append(targets, resp.Targets...)
	}
	return targets, nil
}

// resolveCapabilityFields auto-populates config fields that declare resolveFromCapability
// with the ScrapeURL of the first active plugin matching that capability.
// Admin-provided values always take precedence.
func (m *Manager) resolveCapabilityFields(ctx context.Context, manifest *domain.CatalogManifest, config map[string]string) {
	for _, field := range manifest.Config {
		if field.ResolveFromCapability == "" || config[field.Key] != "" {
			continue
		}
		summaries, err := m.GetActivePluginsByCapability(ctx, field.ResolveFromCapability)
		if err != nil || len(summaries) == 0 {
			continue
		}
		if summaries[0].ScrapeURL != "" {
			config[field.Key] = summaries[0].ScrapeURL
		}
	}
}

// reResolveCapabilityDependents checks every running plugin for config fields
// declared with resolveFromCapability. If a field was previously empty but can
// now be resolved (because newPluginID just became active), the plugin container
// is redeployed with the resolved value injected as an environment variable.
func (m *Manager) reResolveCapabilityDependents(ctx context.Context, newPluginID string) {
	plugins, err := m.store.ListAll(ctx)
	if err != nil {
		return
	}
	for _, p := range plugins {
		if p.ID == newPluginID || m.getStatus(p.ID) != domain.PluginStatusRunning {
			continue
		}
		manifest, err := m.registry.GetManifest(ctx, p.ID)
		if err != nil || manifest == nil {
			continue
		}
		// Skip plugins with no capability-resolved fields.
		hasDep := false
		for _, field := range manifest.Config {
			if field.ResolveFromCapability != "" {
				hasDep = true
				break
			}
		}
		if !hasDep {
			continue
		}

		secrets, _ := m.decryptSecrets(p.Secrets)
		config := mergeConfig(p.Config, secrets)

		// Apply manifest defaults so internal env vars are always present.
		for _, field := range manifest.Config {
			if _, ok := config[field.Key]; !ok && field.Default != "" {
				config[field.Key] = field.Default
			}
		}

		// Snapshot empty resolved fields before resolution.
		emptyBefore := map[string]bool{}
		for _, field := range manifest.Config {
			if field.ResolveFromCapability != "" && config[field.Key] == "" {
				emptyBefore[field.Key] = true
			}
		}

		m.resolveCapabilityFields(ctx, manifest, config)

		// Check whether any previously-empty field was filled in.
		changed := false
		for key := range emptyBefore {
			if config[key] != "" {
				changed = true
				break
			}
		}
		if !changed {
			continue
		}

		m.logger.Info("capability resolved: redeploying plugin", "plugin", p.ID, "trigger", newPluginID)
		spec, caCertPEM, err := m.buildSecureContainerSpec(p, manifest, config)
		if err != nil {
			m.logger.Warn("reResolveCapabilityDependents: build spec failed", "plugin", p.ID, "error", err)
			continue
		}
		if err := m.rt.Deploy(ctx, spec); err != nil {
			m.logger.Warn("reResolveCapabilityDependents: redeploy failed", "plugin", p.ID, "error", err)
			continue
		}
		m.mu.Lock()
		m.caCerts[p.ID] = caCertPEM
		m.mu.Unlock()
		if p.GRPCAddr != "" {
			if err := m.pool.Dial(ctx, p.ID, p.GRPCAddr, caCertPEM); err != nil {
				m.logger.Warn("reResolveCapabilityDependents: redial failed", "plugin", p.ID, "error", err)
			}
		}
	}
}

// GetActivePluginsByCapability returns a summary of all active plugins with the given capability.
// Collector plugins call this to discover backend addresses for remote_write.
// Falls back to manifest-declared capabilities for running plugins whose gRPC discovery hasn't
// succeeded yet (e.g. tier-1 plugins or plugins where the gRPC dial is still pending).
func (m *Manager) GetActivePluginsByCapability(ctx context.Context, capability string) ([]domain.PluginSummary, error) {
	m.mu.RLock()
	grpcIDs := make(map[string]bool)
	for id, caps := range m.capabilities {
		if caps[capability] {
			grpcIDs[id] = true
		}
	}
	m.mu.RUnlock()

	// Also include running plugins that declare the capability in their manifest but
	// haven't had a successful gRPC capability exchange yet.
	allPlugins, _ := m.store.ListAll(ctx)
	for _, p := range allPlugins {
		if grpcIDs[p.ID] || m.getStatus(p.ID) != domain.PluginStatusRunning {
			continue
		}
		manifest, err := m.registry.GetManifest(ctx, p.ID)
		if err != nil || manifest == nil {
			continue
		}
		for _, cap := range manifest.Capabilities {
			if cap == capability {
				grpcIDs[p.ID] = true
				break
			}
		}
	}

	var summaries []domain.PluginSummary
	for id := range grpcIDs {
		p, err := m.store.FindByID(ctx, id)
		if err != nil {
			continue
		}
		summary := domain.PluginSummary{
			ID:           id,
			Capability:   capability,
			InternalAddr: p.GRPCAddr,
		}
		if manifest, err := m.registry.GetManifest(ctx, id); err == nil && manifest != nil {
			for _, c := range manifest.Companions {
				if c.InternalAddr != "" {
					summary.ScrapeURL = c.InternalAddr
					break
				}
			}
			if manifest.Query != nil && manifest.Query.URL != "" {
				summary.QueryURL = manifest.Query.URL + manifest.Query.Path
			}
		}
		summaries = append(summaries, summary)
	}
	return summaries, nil
}

// GetMonitoringOutputs returns one MonitoringOutput for each running plugin that
// declares an Output block in its manifest. The URL is formed by joining the first
// companion's internalAddr with the output path. Collector plugins call this endpoint
// to build their forwarding config dynamically — no collector manifest changes needed
// when new backends are installed.
func (m *Manager) GetMonitoringOutputs(ctx context.Context) ([]domain.MonitoringOutput, error) {
	allPlugins, err := m.store.ListAll(ctx)
	if err != nil {
		return nil, err
	}
	var outputs []domain.MonitoringOutput
	for _, p := range allPlugins {
		if m.getStatus(p.ID) != domain.PluginStatusRunning {
			continue
		}
		manifest, err := m.registry.GetManifest(ctx, p.ID)
		if err != nil || manifest == nil || manifest.Output == nil {
			continue
		}
		// Find the first companion with an internalAddr to use as the base URL.
		var baseURL string
		for _, c := range manifest.Companions {
			if c.InternalAddr != "" {
				baseURL = c.InternalAddr
				break
			}
		}
		if baseURL == "" {
			continue
		}
		secrets, _ := m.decryptSecrets(p.Secrets)
		env := mergeConfig(p.Config, secrets)
		path := substituteEnvVarsStr(manifest.Output.Path, env)
		bearerToken := substituteEnvVarsStr(manifest.Output.BearerToken, env)
		var headers map[string]string
		if len(manifest.Output.Headers) > 0 {
			headers = make(map[string]string, len(manifest.Output.Headers))
			for k, v := range manifest.Output.Headers {
				headers[k] = substituteEnvVarsStr(v, env)
			}
		}
		outputs = append(outputs, domain.MonitoringOutput{
			PluginID:    p.ID,
			Protocol:    manifest.Output.Protocol,
			URL:         baseURL + path,
			BearerToken: bearerToken,
			Headers:     headers,
		})
	}
	return outputs, nil
}

// GetAlertmanagerReceivers returns one AlertmanagerReceiverInstance per running plugin
// that declares an AlertmanagerReceiver block, with ${ENV_VAR} placeholders substituted
// from the plugin's stored config and secrets.
func (m *Manager) GetAlertmanagerReceivers(ctx context.Context) ([]domain.AlertmanagerReceiverInstance, error) {
	allPlugins, err := m.store.ListAll(ctx)
	if err != nil {
		return nil, err
	}
	var receivers []domain.AlertmanagerReceiverInstance
	for _, p := range allPlugins {
		if m.getStatus(p.ID) != domain.PluginStatusRunning {
			continue
		}
		manifest, err := m.registry.GetManifest(ctx, p.ID)
		if err != nil || manifest == nil || manifest.AlertmanagerReceiver == nil {
			continue
		}
		secrets, _ := m.decryptSecrets(p.Secrets)
		cfg := mergeConfig(p.Config, secrets)
		resolved, _ := substituteEnvVars(manifest.AlertmanagerReceiver.Config, cfg).(map[string]interface{})
		receivers = append(receivers, domain.AlertmanagerReceiverInstance{
			Name:   manifest.AlertmanagerReceiver.Name,
			Config: resolved,
		})
	}
	return receivers, nil
}

// substituteEnvVars recursively walks a config map and replaces "${KEY}" placeholders
// with values from env. Non-string values are passed through unchanged.
func substituteEnvVarsStr(s string, env map[string]string) string {
	for k, v := range env {
		s = strings.ReplaceAll(s, "${"+k+"}", v)
	}
	return s
}

func substituteEnvVars(v interface{}, env map[string]string) interface{} {
	switch val := v.(type) {
	case string:
		for k, ev := range env {
			val = strings.ReplaceAll(val, "${"+k+"}", ev)
		}
		return val
	case map[string]interface{}:
		out := make(map[string]interface{}, len(val))
		for k, child := range val {
			out[k] = substituteEnvVars(child, env)
		}
		return out
	case []interface{}:
		out := make([]interface{}, len(val))
		for i, child := range val {
			out[i] = substituteEnvVars(child, env)
		}
		return out
	default:
		return v
	}
}

// IngestWorkloadLog routes a log entry to the active monitoring.logs plugin.
// Non-fatal: silently drops if no logs plugin is installed.
func (m *Manager) IngestWorkloadLog(ctx context.Context, entry *pluginsv1.LogEntry) error {
	m.mu.RLock()
	var logsID string
	for id, caps := range m.capabilities {
		if caps[pluginsv1.CapabilityMonitoringLogs] {
			logsID = id
			break
		}
	}
	m.mu.RUnlock()

	if logsID == "" {
		return nil
	}

	client, err := m.pool.MonitoringLogsClient(logsID)
	if err != nil {
		return fmt.Errorf("monitoring logs client: %w", err)
	}

	callCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	resp, err := client.IngestLog(callCtx, &pluginsv1.IngestLogRequest{Entry: entry})
	if err != nil {
		return fmt.Errorf("IngestLog: %w", err)
	}
	if resp.Error != nil {
		return fmt.Errorf("IngestLog: %s", resp.Error.Message)
	}
	return nil
}

// IngestWorkloadSpan routes a trace span to the active monitoring.traces plugin.
// Non-fatal: silently drops if no traces plugin is installed.
func (m *Manager) IngestWorkloadSpan(ctx context.Context, span *pluginsv1.Span) error {
	m.mu.RLock()
	var tracesID string
	for id, caps := range m.capabilities {
		if caps[pluginsv1.CapabilityMonitoringTraces] {
			tracesID = id
			break
		}
	}
	m.mu.RUnlock()

	if tracesID == "" {
		return nil
	}

	client, err := m.pool.MonitoringTracesClient(tracesID)
	if err != nil {
		return fmt.Errorf("monitoring traces client: %w", err)
	}

	callCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	resp, err := client.IngestSpan(callCtx, &pluginsv1.IngestSpanRequest{Span: span})
	if err != nil {
		return fmt.Errorf("IngestSpan: %w", err)
	}
	if resp.Error != nil {
		return fmt.Errorf("IngestSpan: %s", resp.Error.Message)
	}
	return nil
}

// GetPluginInternalFrontendURL returns the internal (Docker-network) URL stored
// in the plugin DB record's FrontendURL field, or "" if none is set.
func (m *Manager) GetPluginInternalFrontendURL(ctx context.Context, pluginID string) (string, error) {
	p, err := m.store.FindByID(ctx, pluginID)
	if err != nil {
		return "", err
	}
	return p.FrontendURL, nil
}

// ── Secret encryption (AES-256-GCM) ──────────────────────────────────────────

func (m *Manager) encryptSecrets(secrets map[string]string) ([]byte, error) {
	if len(secrets) == 0 {
		return []byte("{}"), nil
	}
	plain, err := json.Marshal(secrets)
	if err != nil {
		return nil, err
	}
	if len(m.secretKey) == 0 {
		return plain, nil // no encryption in development mode
	}

	block, err := aes.NewCipher(m.secretKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ciphertext := gcm.Seal(nonce, nonce, plain, nil)

	// Store as JSON so it round-trips cleanly.
	return json.Marshal(map[string][]byte{"v1": ciphertext})
}

func (m *Manager) decryptSecrets(data []byte) (map[string]string, error) {
	if len(data) == 0 || string(data) == "{}" {
		return map[string]string{}, nil
	}
	if len(m.secretKey) == 0 {
		// Development mode: data is plaintext JSON.
		var out map[string]string
		return out, json.Unmarshal(data, &out)
	}

	var wrapped map[string][]byte
	if err := json.Unmarshal(data, &wrapped); err != nil {
		return map[string]string{}, nil
	}
	ciphertext, ok := wrapped["v1"]
	if !ok {
		return map[string]string{}, nil
	}

	block, err := aes.NewCipher(m.secretKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(ciphertext) < gcm.NonceSize() {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := ciphertext[:gcm.NonceSize()], ciphertext[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	var out map[string]string
	return out, json.Unmarshal(plain, &out)
}

// ── Thread-safe status helpers ────────────────────────────────────────────────

func (m *Manager) setStatus(id string, s domain.PluginStatus) {
	m.mu.Lock()
	m.statuses[id] = s
	m.mu.Unlock()
}

func (m *Manager) getStatus(id string) domain.PluginStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if s, ok := m.statuses[id]; ok {
		return s
	}
	return domain.PluginStatusUnknown
}

func (m *Manager) getRestarts(id string) int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.restarts[id]
}

func (m *Manager) incrementRestarts(id string) {
	m.mu.Lock()
	m.restarts[id]++
	m.mu.Unlock()
}

func (m *Manager) resetRestarts(id string) {
	m.mu.Lock()
	m.restarts[id] = 0
	m.mu.Unlock()
}

// checkNoDependents returns an error if any other plugin declares pluginID as a
// dependency. When enabledOnly is true, only enabled plugins are considered
// (used by Disable); when false, all installed plugins are considered (used by Remove).
func (m *Manager) checkNoDependents(ctx context.Context, pluginID string, enabledOnly bool) error {
	all, err := m.store.ListAll(ctx)
	if err != nil {
		return fmt.Errorf("check dependents: %w", err)
	}
	var dependents []string
	for _, p := range all {
		if p.ID == pluginID {
			continue
		}
		if enabledOnly && !p.Enabled {
			continue
		}
		for _, dep := range p.Dependencies {
			if dep == pluginID {
				dependents = append(dependents, p.ID)
				break
			}
		}
	}
	if len(dependents) > 0 {
		return fmt.Errorf("plugin %q is required by: %s", pluginID, strings.Join(dependents, ", "))
	}
	return nil
}

// ── Config helpers ────────────────────────────────────────────────────────────

// mergeConfig merges a persisted JSON config blob and a secrets map into a
// single string map for container env injection.
func mergeConfig(configJSON []byte, secrets map[string]string) map[string]string {
	out := make(map[string]string, len(secrets))
	for k, v := range secrets {
		out[k] = v
	}
	var plain map[string]string
	if err := json.Unmarshal(configJSON, &plain); err == nil {
		for k, v := range plain {
			out[k] = v
		}
	}
	return out
}

// DeriveSecretKey derives a 32-byte AES-256 key from the SECRET_KEY env var
// using SHA-256. Call this during bootstrap.
// pluginImage returns a fully-tagged image reference. If the image field already
// contains a tag (a colon after the last slash), the version is not appended.
func pluginImage(image, version string) string {
	if image == "" {
		return ""
	}
	ref := image
	if idx := strings.LastIndex(ref, "/"); idx >= 0 {
		ref = ref[idx+1:]
	}
	if !strings.Contains(ref, ":") {
		return image + ":" + version
	}
	return image
}

func DeriveSecretKey(raw string) []byte {
	if raw == "" {
		return nil
	}
	h := sha256.Sum256([]byte(raw))
	return h[:]
}

// ── Registry management ───────────────────────────────────────────────────────

func (m *Manager) ListRegistries(ctx context.Context) ([]*domain.PluginRegistryConfig, error) {
	return m.store.ListRegistries(ctx)
}

func (m *Manager) AddRegistry(ctx context.Context, name, url string) (*domain.PluginRegistryConfig, error) {
	id, err := generateRegistryID()
	if err != nil {
		return nil, fmt.Errorf("add registry: generate id: %w", err)
	}
	reg := &domain.PluginRegistryConfig{
		ID:       id,
		Name:     name,
		URL:      url,
		IsActive: true, // Enabled by default in multi-registry model.
	}
	if err := m.store.SaveRegistry(ctx, reg); err != nil {
		return nil, fmt.Errorf("add registry: %w", err)
	}

	// Pre-fetch catalog so plugins are immediately visible; non-fatal.
	if syncer, ok := m.registry.(ports.RegistrySyncer); ok {
		if syncErr := syncer.SyncForRegistry(ctx, id, url); syncErr != nil {
			m.logger.Warn("add registry: initial sync failed", "id", id, "error", syncErr)
		} else {
			now := time.Now()
			_ = m.store.UpdateRegistrySyncMeta(ctx, id, now, nil)
		}
	}
	return reg, nil
}

func (m *Manager) DeleteRegistry(ctx context.Context, id string) error {
	if _, err := m.store.GetRegistryByID(ctx, id); err != nil {
		return err
	}
	if err := m.store.DeleteRegistry(ctx, id); err != nil {
		return err
	}
	if syncer, ok := m.registry.(ports.RegistrySyncer); ok {
		syncer.InvalidateCache()
	}
	return nil
}

func (m *Manager) ToggleRegistry(ctx context.Context, id string, enabled bool) error {
	reg, err := m.store.GetRegistryByID(ctx, id)
	if err != nil {
		return err
	}
	reg.IsActive = enabled
	if err := m.store.SaveRegistry(ctx, reg); err != nil {
		return err
	}
	if syncer, ok := m.registry.(ports.RegistrySyncer); ok {
		syncer.InvalidateCache()
	}
	return nil
}

func (m *Manager) RefreshRegistry(ctx context.Context, id string) error {
	reg, err := m.store.GetRegistryByID(ctx, id)
	if err != nil {
		return err
	}
	if reg.CooldownUntil != nil && time.Now().Before(*reg.CooldownUntil) {
		return &domain.CooldownError{Until: *reg.CooldownUntil}
	}

	if syncer, ok := m.registry.(ports.RegistrySyncer); ok {
		if err := syncer.SyncForRegistry(ctx, id, reg.URL); err != nil {
			return err
		}
		syncer.InvalidateCache()
	}

	now := time.Now()
	cooldown := now.Add(refreshCooldown)
	if err := m.store.UpdateRegistrySyncMeta(ctx, id, now, &cooldown); err != nil {
		m.logger.Warn("refresh registry: update sync meta", "id", id, "error", err)
	}
	return nil
}

// ── Conflict resolution ───────────────────────────────────────────────────────

func (m *Manager) ListConflicts(ctx context.Context) ([]domain.PluginConflict, error) {
	if lister, ok := m.registry.(ports.RegistryConflictLister); ok {
		return lister.ListConflicts(ctx)
	}
	return nil, nil
}

func (m *Manager) ResolveConflict(ctx context.Context, pluginID, registryID string) error {
	selectedManifest, err := m.getManifestFromRegistry(ctx, pluginID, registryID)
	if err != nil {
		return fmt.Errorf("resolve conflict: %w", err)
	}

	currentManifest, err := m.registry.GetManifest(ctx, pluginID)
	if err != nil {
		return fmt.Errorf("resolve conflict: get current manifest: %w", err)
	}

	installed, err := m.store.FindByID(ctx, pluginID)
	if err != nil && err != commonDomain.ErrNotFound {
		return fmt.Errorf("resolve conflict: load installed plugin: %w", err)
	}
	if err == commonDomain.ErrNotFound {
		installed = nil
	}

	if err := m.store.SetRegistryPreference(ctx, pluginID, registryID); err != nil {
		return fmt.Errorf("resolve conflict: %w", err)
	}
	if syncer, ok := m.registry.(ports.RegistrySyncer); ok {
		syncer.InvalidateCache()
	}

	if installed == nil {
		return nil
	}

	if !installedPluginNeedsReinstall(installed, selectedManifest) {
		if installed.DisplayName != selectedManifest.Name {
			installed.DisplayName = selectedManifest.Name
			installed.UpdatedAt = time.Now().UTC()
			if err := m.store.Save(ctx, installed); err != nil {
				return fmt.Errorf("resolve conflict: sync installed plugin metadata: %w", err)
			}
		}
		return nil
	}

	if err := m.reinstallInstalledPlugin(ctx, installed, currentManifest, selectedManifest); err != nil {
		return fmt.Errorf("resolve conflict: reinstall installed plugin: %w", err)
	}
	return nil
}

func (m *Manager) ResetConflictPreference(ctx context.Context, pluginID string) error {
	if err := m.store.DeleteRegistryPreference(ctx, pluginID); err != nil {
		return fmt.Errorf("reset conflict preference: %w", err)
	}
	if syncer, ok := m.registry.(ports.RegistrySyncer); ok {
		syncer.InvalidateCache()
	}
	return nil
}

func (m *Manager) ListRegistryPreferences(ctx context.Context) ([]*domain.RegistryPreference, error) {
	return m.store.ListRegistryPreferences(ctx)
}

func (m *Manager) getManifestFromRegistry(ctx context.Context, pluginID, registryID string) (*domain.CatalogManifest, error) {
	regs, err := m.store.ListEnabledRegistries(ctx)
	if err != nil {
		return nil, fmt.Errorf("list enabled registries: %w", err)
	}

	enabled := false
	for _, reg := range regs {
		if reg.ID == registryID {
			enabled = true
			break
		}
	}
	if !enabled {
		return nil, fmt.Errorf("registry %q is not enabled", registryID)
	}

	catalogs, err := m.store.GetAllCachedCatalogs(ctx)
	if err != nil {
		return nil, fmt.Errorf("load cached catalogs: %w", err)
	}
	for _, manifest := range catalogs[registryID] {
		if manifest.ID == pluginID {
			return manifest, nil
		}
	}
	return nil, fmt.Errorf("plugin %q was not found in registry %q", pluginID, registryID)
}

func installedPluginNeedsReinstall(p *domain.Plugin, manifest *domain.CatalogManifest) bool {
	expectedImage := ""
	expectedGRPCAddr := ""
	if !isStaticTier(manifest) {
		expectedImage = fmt.Sprintf("%s:%s", manifest.Image, manifest.Version)
		expectedGRPCAddr = fmt.Sprintf("kleff-%s:%d", manifest.ID, grpcPort)
	}

	return p.Type != manifest.Type ||
		p.Image != expectedImage ||
		p.Version != manifest.Version ||
		p.FrontendURL != manifest.FrontendURL ||
		p.GRPCAddr != expectedGRPCAddr ||
		!sameStrings(p.Dependencies, manifest.Dependencies)
}

func sameStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func (m *Manager) reinstallInstalledPlugin(ctx context.Context, p *domain.Plugin, oldManifest, newManifest *domain.CatalogManifest) error {
	m.setStatus(p.ID, domain.PluginStatusInstalling)

	_ = m.pool.Close(p.ID)
	if p.GRPCAddr != "" {
		if err := m.rt.Remove(ctx, "kleff-"+p.ID); err != nil {
			m.logger.Warn("reinstall plugin: remove existing container failed", "id", p.ID, "error", err)
		}
	}
	if oldManifest != nil {
		m.removeCompanions(ctx, oldManifest)
	}
	m.clearCapabilities(p.ID)

	p.Type = newManifest.Type
	p.DisplayName = newManifest.Name
	p.Version = newManifest.Version
	p.FrontendURL = newManifest.FrontendURL
	p.Dependencies = append([]string(nil), newManifest.Dependencies...)
	p.UpdatedAt = time.Now().UTC()

	if isStaticTier(newManifest) {
		p.Image = ""
		p.GRPCAddr = ""
	} else {
		p.Image = fmt.Sprintf("%s:%s", newManifest.Image, newManifest.Version)
		p.GRPCAddr = fmt.Sprintf("kleff-%s:%d", newManifest.ID, grpcPort)
	}

	if err := m.store.Save(ctx, p); err != nil {
		m.setStatus(p.ID, domain.PluginStatusError)
		return fmt.Errorf("save updated plugin: %w", err)
	}

	if !p.Enabled {
		m.setStatus(p.ID, domain.PluginStatusDisabled)
		return nil
	}

	if isStaticTier(newManifest) {
		m.setStaticCapabilities(p.ID, newManifest)
		m.setStatus(p.ID, domain.PluginStatusRunning)
		return nil
	}

	if err := m.ensureRunning(ctx, p); err != nil {
		m.setStatus(p.ID, domain.PluginStatusError)
		return err
	}
	return nil
}

func (m *Manager) setStaticCapabilities(id string, manifest *domain.CatalogManifest) {
	caps := make(map[string]bool, len(manifest.Capabilities))
	for _, c := range manifest.Capabilities {
		caps[c] = true
	}

	if permitted := permittedCapabilities(manifest.Tags); permitted != nil {
		for c := range caps {
			if !permitted[c] {
				m.logger.Warn("plugin capability denied by tag permissions",
					"plugin", id, "capability", c)
				delete(caps, c)
			}
		}
	}

	m.mu.Lock()
	m.capabilities[id] = caps
	m.mu.Unlock()
}

// registrySyncLoop runs hourly and auto-syncs all enabled registries that haven't
// been synced recently.
func (m *Manager) registrySyncLoop(ctx context.Context) {
	ticker := time.NewTicker(autoSyncCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.autoSyncEnabledRegistries(ctx)
		}
	}
}

func (m *Manager) autoSyncEnabledRegistries(ctx context.Context) {
	regs, err := m.store.ListEnabledRegistries(ctx)
	if err != nil || len(regs) == 0 {
		return
	}
	for _, reg := range regs {
		if reg.LastSyncedAt != nil && time.Since(*reg.LastSyncedAt) < autoSyncInterval {
			continue
		}
		m.logger.Info("plugin registry: auto-syncing", "id", reg.ID)
		if syncer, ok := m.registry.(ports.RegistrySyncer); ok {
			if err := syncer.SyncForRegistry(ctx, reg.ID, reg.URL); err != nil {
				m.logger.Warn("plugin registry: auto-sync failed", "id", reg.ID, "error", err)
				continue
			}
			syncer.InvalidateCache()
		}
		now := time.Now()
		if err := m.store.UpdateRegistrySyncMeta(ctx, reg.ID, now, nil); err != nil {
			m.logger.Warn("plugin registry: auto-sync: update sync meta", "id", reg.ID, "error", err)
		}
	}
}

func generateRegistryID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", b), nil
}
