import os
import sys
import http.server
import socketserver
import time

PORT = 9000
BIND = "127.0.0.1"

# Servidor con capacidad de multiples hilos (evita que el navegador congete al cargar multiples archivos estaticos)
class ThreadingSimpleServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

# Handler modificado para un servidor mas resiliente
class ResilientHandler(http.server.SimpleHTTPRequestHandler):
    # Soluciona la lectura erronea de modulos JS que a veces ocurre
    extensions_map = http.server.SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map.update({
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml'
    })

    # Evita el molesto delay de reverse DNS lookup (muy comun en Windows 11)   
    def address_string(self):
        host, port = self.client_address[:2]
        return host
        
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

if __name__ == '__main__':
    # Intenta arrancar el reservert, maneja el caso donde el puerto esta ocupado
    max_retries = 3
    for i in range(max_retries):
        try:
            with ThreadingSimpleServer((BIND, PORT), ResilientHandler) as httpd:
                print(f"Servidor backend activo exitosamente en {BIND}:{PORT}")
                httpd.serve_forever()
            break
        except OSError as e:
            if e.errno == 10048 or "10048" in str(e): # WinError 10048: Address already in use
                print(f"Puerto {PORT} ocupado. Reintentando en 2 segundos... ({i+1}/{max_retries})")
                time.sleep(2)
            else:
                print(f"Error de red fatal: {e}")
                break
