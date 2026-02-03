from pydantic import BaseModel, ConfigDict, ValidationError
from typing import Any, Optional

class BaseGolfModel(BaseModel):
    """Shared configuration and methods."""
    model_config = ConfigDict(validate_assignment=True)

    def update_field(self, field_name: str, value: Any) -> Optional[str]:
        """Update a field with user correction. Returns error message if validation fails."""
        try:
            setattr(self, field_name, value)
            return None
        except ValidationError as e:
            return e.errors()[0]['msg']