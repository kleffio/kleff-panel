package bootstrap

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"time"

	// PostgreSQL driver — blank import registers the "pgx" driver with database/sql.
	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/kleffio/platform/internal/database"

	// Domain module HTTP handlers
	adminhttp "github.com/kleffio/platform/internal/core/admin/adapters/http"
	audithttp "github.com/kleffio/platform/internal/core/audit/adapters/http"
	billinghttp "github.com/kleffio/platform/internal/core/billing/adapters/http"
	cataloghttp "github.com/kleffio/platform/internal/core/catalog/adapters/http"
	catalogpersistence "github.com/kleffio/platform/internal/core/catalog/adapters/persistence"
	catalogregistry "github.com/kleffio/platform/internal/core/catalog/adapters/registry"
	deploymentshttp "github.com/kleffio/platform/internal/core/deployments/adapters/http"
	deploymentspersistence "github.com/kleffio/platform/internal/core/deployments/adapters/persistence"
	deploymentscommands "github.com/kleffio/platform/internal/core/deployments/application/commands"
	notificationshttp "github.com/kleffio/platform/internal/core/notifications/adapters/http"
	notificationspersistence "github.com/kleffio/platform/internal/core/notifications/adapters/persistence"
	notificationsapp "github.com/kleffio/platform/internal/core/notifications/application"
	identityhttp "github.com/kleffio/platform/internal/core/identity/adapters/http"
	identitypersistence "github.com/kleffio/platform/internal/core/identity/adapters/persistence"
	identityapp "github.com/kleffio/platform/internal/core/identity/application"
	usershttp "github.com/kleffio/platform/internal/core/users/adapters/http"
	userspersistence "github.com/kleffio/platform/internal/core/users/adapters/persistence"
	usersapp "github.com/kleffio/platform/internal/core/users/application"
	nodeshttp "github.com/kleffio/platform/internal/core/nodes/adapters/http"
	nodespersistence "github.com/kleffio/platform/internal/core/nodes/adapters/persistence"
	nodesapp "github.com/kleffio/platform/internal/core/nodes/application"
	organizationshttp "github.com/kleffio/platform/internal/core/organizations/adapters/http"
	organizationspersistence "github.com/kleffio/platform/internal/core/organizations/adapters/persistence"
	pluginhttp "github.com/kleffio/platform/internal/core/plugins/adapters/http"
	pluginpersistence "github.com/kleffio/platform/internal/core/plugins/adapters/persistence"
	pluginregistry "github.com/kleffio/platform/internal/core/plugins/adapters/registry"
	pluginapplication "github.com/kleffio/platform/internal/core/plugins/application"
	projectshttp "github.com/kleffio/platform/internal/core/projects/adapters/http"
	projectspersistence "github.com/kleffio/platform/internal/core/projects/adapters/persistence"
	namespaceshttp "github.com/kleffio/platform/internal/core/namespaces/adapters/http"
	namespacespersistence "github.com/kleffio/platform/internal/core/namespaces/adapters/persistence"
	environmentshttp "github.com/kleffio/platform/internal/core/environments/adapters/http"
	environmentspersistence "github.com/kleffio/platform/internal/core/environments/adapters/persistence"
	variableshttp "github.com/kleffio/platform/internal/core/variables/adapters/http"
	variablespersistence "github.com/kleffio/platform/internal/core/variables/adapters/persistence"
	logshttp "github.com/kleffio/platform/internal/core/logs/adapters/http"
	logsdomain "github.com/kleffio/platform/internal/core/logs/domain"
	logspersistence "github.com/kleffio/platform/internal/core/logs/adapters/persistence"
	logsrouting "github.com/kleffio/platform/internal/core/logs/adapters/routing"
	pluginsv1 "github.com/kleffio/plugin-sdk-go/v1"
	usagehttp "github.com/kleffio/platform/internal/core/usage/adapters/http"
	usagepersistence "github.com/kleffio/platform/internal/core/usage/adapters/persistence"
	workloadshttp "github.com/kleffio/platform/internal/core/workloads/adapters/http"
	workloadspersistence "github.com/kleffio/platform/internal/core/workloads/adapters/persistence"
	workloadcmd "github.com/kleffio/platform/internal/core/workloads/application/commands"
	"github.com/kleffio/platform/internal/shared/events"
	"github.com/kleffio/platform/internal/shared/middleware"
	sharedqueue "github.com/kleffio/platform/internal/shared/queue"
	"github.com/kleffio/platform/internal/shared/runtime"
	runtimedocker "github.com/kleffio/platform/internal/shared/runtime/docker"
	runtimek8s "github.com/kleffio/platform/internal/shared/runtime/kubernetes"
	runtimemanual "github.com/kleffio/platform/internal/shared/runtime/manual"
)

// Container holds all wired-up application components.
type Container struct {
	Config        *Config
	Logger        *slog.Logger
	DB            *sql.DB
	TokenVerifier middleware.TokenVerifier
	NodeVerifier  middleware.NodeTokenVerifier
	EventBus      *events.Bus
	// Plugin manager — owns all plugin lifecycle and gRPC connections.
	PluginManager *pluginapplication.Manager

	// Identity service — resolves stable platform user from IDP claims.
	IdentityService *identityapp.IdentityService

	// HTTP handler groups per domain module
	AuthHandler          *pluginhttp.AuthHandler
	SetupHandler         *pluginhttp.SetupHandler
	CatalogHandler       *cataloghttp.Handler
	IdentityHandler      *identityhttp.IdentityHandler
	OrganizationsHandler *organizationshttp.Handler
	ProjectsHandler      *projectshttp.Handler
	WorkloadsHandler     *workloadshttp.Handler
	DeploymentsHandler   *deploymentshttp.Handler
	NodesHandler         *nodeshttp.Handler
	BillingHandler       *billinghttp.Handler
	UsageHandler         *usagehttp.Handler
	LogsHandler          *logshttp.Handler
	AuditHandler         *audithttp.Handler
	AdminHandler         *adminhttp.Handler
	PluginsHandler       *pluginhttp.Handler
	NotificationsHandler *notificationshttp.Handler
	NotificationService  *notificationsapp.Service
	NotificationHub      *notificationsapp.Hub
	UsersHandler         *usershttp.Handler
	NamespacesHandler    *namespaceshttp.Handler
	EnvironmentsHandler  *environmentshttp.Handler
	VariablesHandler     *variableshttp.Handler
}

// NewContainer wires all dependencies and returns the composition root.
func NewContainer(cfg *Config, logger *slog.Logger) (*Container, error) {
	db, err := openDatabase(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := database.Migrate(db, logger); err != nil {
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	// ── Plugin system ─────────────────────────────────────────────────────────

	rt, err := buildRuntimeAdapter(cfg, logger)
	if err != nil {
		return nil, fmt.Errorf("build runtime adapter: %w", err)
	}

	pluginStore := pluginpersistence.NewPostgresPluginStore(db)

	dbRegistry := pluginregistry.NewDBRegistry(pluginStore, cfg.PluginRegistryURL)
	// Seed the default registry row if this is a fresh install. Non-fatal.
	if err := dbRegistry.EnsureDefault(context.Background()); err != nil {
		logger.Warn("plugin registry: ensure default warning", "error", err)
	}

	secretKey := pluginapplication.DeriveSecretKey(cfg.SecretKey)

	pluginMgr := pluginapplication.New(pluginStore, dbRegistry, rt, secretKey, cfg.PluginNetwork, cfg.CompanionEnv, logger)

	// Start plugin manager: loads installed plugins from DB, ensures containers
	// are running, starts health-check and registry-sync goroutines.
	if err := pluginMgr.Start(context.Background()); err != nil {
		logger.Warn("plugin manager start warning", "error", err)
		// Non-fatal: server continues even if some plugins fail to start.
	}

	catalogStore := catalogpersistence.NewPostgresCatalogStore(db)

	// Sync crates, blueprints, and constructs from the remote crate registry.
	// Non-fatal: if the registry is unreachable on startup, existing DB data is used.
	crateRegistry := catalogregistry.New(cfg.CrateRegistryURL, cfg.ImagesDir)
	if err := crateRegistry.Sync(context.Background(), catalogStore); err != nil {
		logger.Warn("crate registry sync warning", "error", err)
	} else {
		logger.Info("crate registry synced")
	}

	go func() {
		ticker := time.NewTicker(time.Duration(cfg.CrateSyncInterval) * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if err := crateRegistry.Sync(context.Background(), catalogStore); err != nil {
				logger.Warn("crate registry hourly sync warning", "error", err)
			} else {
				logger.Info("crate registry hourly sync complete")
			}
		}
	}()

	deploymentStore := deploymentspersistence.NewPostgresDeploymentStore(db)
	enqueuer, err := buildEnqueuer(cfg)
	if err != nil {
		return nil, fmt.Errorf("build daemon queue enqueuer: %w", err)
	}
	if _, ok := enqueuer.(sharedqueue.NopEnqueuer); ok {
		logger.Warn("daemon queue enqueuer not configured; deployments enqueue will fail")
	}
	createDeployment := deploymentscommands.NewCreateDeploymentHandler(deploymentStore, catalogStore, enqueuer)
	serverAction := deploymentscommands.NewServerActionHandler(deploymentStore, catalogStore, enqueuer)

	nodeStore := nodespersistence.NewPostgresNodeStore(db)
	nodeVerifier := nodesapp.NewTokenVerifier(nodeStore)

	orgStore := organizationspersistence.NewPostgresOrgStore(db)
	identityUserStore := identitypersistence.NewPostgresUserStore(db)

	// Namespaces module (unified user/org model) — must be created before identitySvc
	// so the namespace store can be used as the NsBootstrapper.
	namespacesStore := namespacespersistence.NewPostgresNamespaceStore(db)

	identitySvc := identityapp.NewIdentityService(identityUserStore, orgStore, namespacesStore)

	projectsStore := projectspersistence.NewPostgresProjectStore(db)
	workloadsStore := workloadspersistence.NewPostgresStore(db)

	queuePublisher, err := buildQueuePublisher(cfg)
	if err != nil {
		return nil, fmt.Errorf("build daemon queue publisher: %w", err)
	}
	if _, ok := queuePublisher.(sharedqueue.NopPublisher); ok {
		logger.Warn("daemon queue publisher not configured; workload provision enqueue will fail")
	}

	bus := events.New()

	notificationStore := notificationspersistence.NewPostgresNotificationStore(db)
	notificationHub := notificationsapp.NewHub()
	notificationSvc := notificationsapp.NewService(notificationStore, notificationHub, logger)

	userProfileStore := userspersistence.NewPostgresUserProfileStore(db)
	userSvc := usersapp.NewService(userProfileStore)

	namespacesHandler := namespaceshttp.NewHandler(namespacesStore, notificationSvc, logger, cfg.UploadDir)

	// Environments module
	envStore := environmentspersistence.NewPostgresEnvironmentStore(db)
	envHandler := environmentshttp.NewHandler(envStore, namespacesStore, logger)

	// Variables module
	varStore := variablespersistence.NewPostgresVariableStore(db)
	varHandler := variableshttp.NewHandler(varStore, envStore, namespacesStore, logger)

	provisionHandler := workloadcmd.NewProvisionWorkloadHandler(workloadsStore, projectsStore, queuePublisher, catalogStore, logger)
	workloadAction := workloadcmd.NewWorkloadActionHandler(workloadsStore, projectsStore, queuePublisher, logger)

	metricsSink := pluginapplication.NewMetricsSinkAdapter(pluginMgr)

	return &Container{
		Config:        cfg,
		Logger:        logger,
		DB:            db,
		TokenVerifier: middleware.NewPluginTokenVerifier(pluginMgr),
		NodeVerifier:  nodeVerifier,
		EventBus:      bus,
		PluginManager: pluginMgr,

		IdentityService: identitySvc,

		AuthHandler:          pluginhttp.NewAuthHandler(pluginMgr, logger),
		SetupHandler:         pluginhttp.NewSetupHandler(pluginMgr, dbRegistry, logger),
		CatalogHandler:       cataloghttp.NewHandler(catalogStore, cfg.ImagesDir, logger),
		IdentityHandler:      identityhttp.NewIdentityHandler(),
		OrganizationsHandler: organizationshttp.NewHandler(orgStore, notificationSvc, logger),
		DeploymentsHandler:   deploymentshttp.NewHandler(createDeployment, serverAction, deploymentStore, cfg.SecretKey, logger),
		ProjectsHandler:      projectshttp.NewHandler(projectsStore, orgStore, namespacesStore, notificationSvc, logger),
		WorkloadsHandler:     workloadshttp.NewHandler(projectsStore, envStore, namespacesStore, orgStore, workloadsStore, usagepersistence.NewPostgresUsageStore(db), metricsSink, provisionHandler, workloadAction, queuePublisher, bus, nodeStore, cfg.NodeBootstrapSecret, logger),
		NodesHandler:         nodeshttp.NewHandler(nodeStore, logger),
		BillingHandler:       billinghttp.NewHandler(logger),
		UsageHandler:         usagehttp.NewHandler(usagepersistence.NewPostgresUsageStore(db), logger),
		LogsHandler: logshttp.NewHandler(logsrouting.NewStore(
			logspersistence.NewPostgresLogStore(db),
			func(ctx context.Context) string {
				summaries, err := pluginMgr.GetActivePluginsByCapability(ctx, "monitoring.logs")
				if err != nil || len(summaries) == 0 {
					return ""
				}
				return summaries[0].QueryURL
			},
			func(lines []*logsdomain.LogLine) {
				ctx := context.Background()
				for _, l := range lines {
					if err := pluginMgr.IngestWorkloadLog(ctx, &pluginsv1.LogEntry{
						WorkloadID: l.WorkloadID,
						ProjectID:  l.ProjectID,
						Timestamp:  l.Ts.UnixNano(),
						Message:    l.Line,
						Level:      l.Stream,
					}); err != nil {
						logger.Warn("log forward to plugin failed", "error", err, "workload_id", l.WorkloadID)
					}
				}
			},
		), logger),
		AuditHandler:         audithttp.NewHandler(logger),
		AdminHandler:         adminhttp.NewHandler(logger),
		PluginsHandler:       pluginhttp.NewHandler(pluginMgr, dbRegistry, logger),
		NotificationsHandler: notificationshttp.NewHandler(notificationSvc, notificationHub, logger),
		NotificationService:  notificationSvc,
		NotificationHub:      notificationHub,
		UsersHandler:         usershttp.NewHandler(userSvc, cfg.UploadDir, logger),
		NamespacesHandler:    namespacesHandler,
		EnvironmentsHandler:  envHandler,
		VariablesHandler:     varHandler,
	}, nil
}

func buildEnqueuer(cfg *Config) (sharedqueue.Enqueuer, error) {
	if strings.TrimSpace(cfg.DaemonQueueURL) == "" {
		return sharedqueue.NopEnqueuer{}, nil
	}
	return sharedqueue.NewRedisEnqueuer(cfg.DaemonQueueURL, cfg.DaemonQueuePassword, cfg.DaemonQueueTLS)
}

func buildQueuePublisher(cfg *Config) (sharedqueue.Publisher, error) {
	if strings.TrimSpace(cfg.DaemonQueueURL) == "" {
		return sharedqueue.NopPublisher{}, nil
	}
	return sharedqueue.NewRedisPublisher(cfg.DaemonQueueURL, cfg.DaemonQueuePassword, cfg.DaemonQueueTLS)
}

// buildRuntimeAdapter constructs the appropriate RuntimeAdapter from config.
func buildRuntimeAdapter(cfg *Config, logger *slog.Logger) (runtime.RuntimeAdapter, error) {
	switch cfg.RuntimeProvider {
	case "kubernetes":
		return runtimek8s.New(cfg.PluginNamespace)
	case "manual":
		return runtimemanual.New(runtimemanual.ParseAddrsFromEnv()), nil
	default: // "docker"
		return runtimedocker.New(cfg.PluginNetwork, logger)
	}
}

// openDatabase opens and pings the Postgres database.
func openDatabase(dsn string) (*sql.DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("sql open: %w", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return db, nil
}
