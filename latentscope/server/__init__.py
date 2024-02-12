import argparse
from latentscope.util import update_data_dir

def start():
  parser = argparse.ArgumentParser(description='Start the Latent Scope API')
  parser.add_argument('data_dir', type=str, nargs='?', default=None, help='Path to the directory where data is stored')
  parser.add_argument('--host', type=str, default="0.0.0.0", help='Host to serve the server on')
  parser.add_argument('--port', type=int, default=5001, help='Port to run the server on')
  parser.add_argument('--debug', action='store_true', help='Run server in debug mode')

  args = parser.parse_args()
  # This sets the environment variable expected
  update_data_dir(args.data_dir)
  from .app import serve
  serve(args.host, args.port, args.debug)

def serve(host="0.0.0.0", port=5001, debug=False):
  from .app import serve
  serve(host, port, debug)