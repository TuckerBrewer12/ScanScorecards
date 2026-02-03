from pydantic import BaseModel, ConfigDict, Field, ValidationError
from typing import Any, Optional


class Hole(BaseModel):
    """Represents a single hole on a golf course."""
    model_config = ConfigDict(validate_assignment=True)

    number: Optional[int] = Field(None, ge=1, le=18)
    par: Optional[int] = Field(None, ge=3, le=6)
    handicap: Optional[int] = Field(None, ge=1, le=18)
    course_id: Optional[str] = None

    def update_field(self, field_name: str, value: Any) -> Optional[str]:
        """Update a field with user correction. Returns error message if validation fails."""
        try:
            setattr(self, field_name, value)
            return None
        except ValidationError as e:
            return e.errors()[0]['msg']