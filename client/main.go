package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

type ProxyRequest struct {
	ID      string                 `json:"id"`
	Method  string                 `json:"method"`
	Path    string                 `json:"path"`
	Headers map[string]interface{} `json:"headers"`
	Body    string                 `json:"body"`
}

type ProxyResponse struct {
	ID      string              `json:"id"`
	Status  int                 `json:"status,omitempty"`
	Headers map[string][]string `json:"headers,omitempty"`
	Body    string              `json:"body,omitempty"`
	Error   string              `json:"error,omitempty"`
}

func main() {
	server := flag.String("server", "http://localhost:3000", "WebVPN server URL")
	key := flag.String("key", "", "Client key")
	port := flag.Int("port", 80, "Local service port")
	version := flag.String("version", "", "Client version")
	flag.Parse()

	if *key == "" {
		fmt.Fprintln(os.Stderr, "Missing --key")
		os.Exit(1)
	}

	for {
		if err := run(*server, *key, *port, *version); err != nil {
			fmt.Fprintln(os.Stderr, "Disconnected:", err)
		}
		time.Sleep(3 * time.Second)
	}
}

func run(server, key string, port int, version string) error {
	wsURL, err := url.Parse(server)
	if err != nil {
		return err
	}
	if wsURL.Scheme == "https" {
		wsURL.Scheme = "wss"
	} else {
		wsURL.Scheme = "ws"
	}
	wsURL.Path = "/ws"
	q := wsURL.Query()
	q.Set("key", key)
	if version != "" {
		q.Set("version", version)
	}
	wsURL.RawQuery = q.Encode()

	conn, _, err := websocket.DefaultDialer.Dial(wsURL.String(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()
	fmt.Println("Connected to WebVPN server.")

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	go func() {
		for range ticker.C {
			_ = conn.WriteJSON(map[string]string{"type": "heartbeat"})
		}
	}()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			return err
		}

		var req ProxyRequest
		if err := json.Unmarshal(message, &req); err != nil || req.ID == "" {
			sendError(conn, req.ID, "Invalid request")
			continue
		}

		resp, err := forwardRequest(req, port)
		if err != nil {
			sendError(conn, req.ID, err.Error())
			continue
		}

		if err := conn.WriteJSON(resp); err != nil {
			return err
		}
	}
}

func forwardRequest(req ProxyRequest, port int) (*ProxyResponse, error) {
	bodyBytes := []byte{}
	if req.Body != "" {
		decoded, err := base64.StdEncoding.DecodeString(req.Body)
		if err != nil {
			return nil, err
		}
		bodyBytes = decoded
	}

	target := fmt.Sprintf("http://127.0.0.1:%d%s", port, req.Path)
	httpReq, err := http.NewRequestWithContext(context.Background(), req.Method, target, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	for key, value := range req.Headers {
		switch typed := value.(type) {
		case string:
			httpReq.Header.Set(key, typed)
		case []interface{}:
			for _, item := range typed {
				if str, ok := item.(string); ok {
					httpReq.Header.Add(key, str)
				}
			}
		}
	}
	httpReq.Host = "127.0.0.1"

	client := &http.Client{Timeout: 30 * time.Second}
	res, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	responseBody, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	return &ProxyResponse{
		ID:      req.ID,
		Status:  res.StatusCode,
		Headers: res.Header,
		Body:    base64.StdEncoding.EncodeToString(responseBody),
	}, nil
}

func sendError(conn *websocket.Conn, id, message string) {
	resp := ProxyResponse{ID: id, Error: message}
	_ = conn.WriteJSON(resp)
}
