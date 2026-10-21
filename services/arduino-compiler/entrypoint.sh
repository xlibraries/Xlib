#!/bin/sh
# No arguments: the compile service. Otherwise: compile one sketch (see compile.sh).
if [ "$#" -eq 0 ]; then exec python3 /opt/service/server.py; fi
exec compile "$@"
