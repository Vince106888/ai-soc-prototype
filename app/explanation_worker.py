"""Separate model worker: inference cannot block the collection polling loop."""

import argparse
import json
import signal
from threading import Event

from . import database, deployment
from .explanation_jobs import process_one


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    deployment.validate()
    database.migrate_schema()
    stop = Event()
    for name in (signal.SIGTERM, signal.SIGINT):
        signal.signal(name, lambda *_: stop.set())
    while not stop.is_set():
        result = process_one()
        if result != "idle":
            print(json.dumps({"explanation": result}), flush=True)
        if args.once:
            return
        stop.wait(3 if result == "idle" else 0.1)


if __name__ == "__main__":
    main()
