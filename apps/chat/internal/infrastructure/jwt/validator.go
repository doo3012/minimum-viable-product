package jwt

import (
	"errors"
	"fmt"
	"os"

	gojwt "github.com/golang-jwt/jwt/v5"
)

type ChatClaims struct {
	Sub         string `json:"sub"`
	BuID        string `json:"bu_id"`
	DisplayName string `json:"display_name"`
	Purpose     string `json:"purpose"`
	gojwt.RegisteredClaims
}

func ValidateChatToken(tokenString string) (*ChatClaims, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "super-secret-key-at-least-32-chars-long!!"
	}

	token, err := gojwt.ParseWithClaims(tokenString, &ChatClaims{}, func(token *gojwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*gojwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*ChatClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	if claims.Purpose != "chat" {
		return nil, errors.New("token not for chat")
	}

	return claims, nil
}
