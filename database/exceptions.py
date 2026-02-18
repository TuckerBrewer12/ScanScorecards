class DatabaseError(Exception):
    """Base for all database errors."""


class NotFoundError(DatabaseError):
    """Entity not found."""


class DuplicateError(DatabaseError):
    """Unique constraint violation."""


class IntegrityError(DatabaseError):
    """Foreign key or check constraint violation."""
