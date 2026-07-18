"""In-memory set of saved repo full-names, used to cheaply exclude saved repos from the
trending feed without a DB hit on every read/broadcast. Kept in sync with the saved_repos
table by the saved router, and loaded once at startup."""

_saved_names: set[str] = set()


def get_saved_names() -> set[str]:
    return _saved_names


def set_saved_names(names: set[str]) -> None:
    global _saved_names
    _saved_names = set(names)


def add_saved(name: str) -> None:
    _saved_names.add(name)


def remove_saved(name: str) -> None:
    _saved_names.discard(name)
