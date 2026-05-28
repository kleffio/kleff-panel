// Package upload provides helpers for parsing and persisting uploaded image files.
package upload

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/kleffio/platform/internal/shared/ids"
)

var allowedMIME = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

// SaveImage parses a multipart request, validates the uploaded file is an image,
// and writes it to uploadDir/subdir with a UUID filename. It returns the public
// URL path (/uploads/<subdir>/<uuid>.<ext>) on success.
func SaveImage(r *http.Request, field, uploadDir, subdir string, maxBytes int64) (string, error) {
	if err := r.ParseMultipartForm(maxBytes); err != nil {
		return "", fmt.Errorf("parse form: %w", err)
	}

	f, hdr, err := r.FormFile(field)
	if err != nil {
		return "", fmt.Errorf("read field %q: %w", field, err)
	}
	defer f.Close()

	if hdr.Size > maxBytes {
		return "", fmt.Errorf("file exceeds %d bytes", maxBytes)
	}

	// Determine content type from the declared Content-Type header, falling back
	// to sniffing the first 512 bytes.
	ct := hdr.Header.Get("Content-Type")
	if ct == "" {
		buf := make([]byte, 512)
		n, _ := f.Read(buf)
		ct = http.DetectContentType(buf[:n])
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			return "", fmt.Errorf("seek: %w", err)
		}
	}
	mediaType, _, _ := mime.ParseMediaType(ct)

	ext, ok := allowedMIME[strings.ToLower(mediaType)]
	if !ok {
		return "", fmt.Errorf("unsupported image type: %s", mediaType)
	}

	dir := filepath.Join(uploadDir, subdir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create upload dir: %w", err)
	}

	filename := ids.New() + ext
	dest := filepath.Join(dir, filename)

	out, err := os.Create(dest)
	if err != nil {
		return "", fmt.Errorf("create file: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, io.LimitReader(f, maxBytes)); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}

	return "/uploads/" + subdir + "/" + filename, nil
}
