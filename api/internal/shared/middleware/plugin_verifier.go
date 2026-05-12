package middleware

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/kleffio/platform/internal/core/plugins/ports"
)

// PluginTokenVerifier implements TokenVerifier by delegating to the active
// IDP plugin's ValidateToken gRPC method.
type PluginTokenVerifier struct {
	manager ports.PluginManager
}

func NewPluginTokenVerifier(manager ports.PluginManager) *PluginTokenVerifier {
	return &PluginTokenVerifier{manager: manager}
}

func (v *PluginTokenVerifier) Verify(ctx context.Context, rawToken string) (*VerifyResult, error) {
	claims, err := v.manager.ValidateToken(ctx, rawToken)
	if err != nil {
		return nil, fmt.Errorf("token validation: %w", err)
	}
	roles := claims.Roles
	if roles == nil {
		roles = []string{}
	}
	return &VerifyResult{
		Issuer:   extractJWTIssuer(rawToken),
		Subject:  claims.Subject,
		Username: claims.Username,
		Email:    claims.Email,
		Roles:    roles,
	}, nil
}

// extractJWTIssuer decodes the JWT payload (without cryptographic verification,
// which is already done by the IDP plugin) and returns the "iss" claim.
func extractJWTIssuer(token string) string {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 {
		return ""
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ""
	}
	var c struct {
		Issuer string `json:"iss"`
	}
	if err := json.Unmarshal(payload, &c); err != nil {
		return ""
	}
	return c.Issuer
}
