from __future__ import annotations

import copy
import re
from typing import Any

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:  # pragma: no cover - fallback path for minimal environments
    Draft202012Validator = None
    FormatChecker = None

from .types import ToolCallContent, ToolDefinition


def validate_tool_call(tools: list[ToolDefinition], tool_call: ToolCallContent) -> dict[str, Any]:
    tool = next((item for item in tools if item.name == tool_call.name), None)
    if not tool:
        raise ValueError(f'Tool "{tool_call.name}" not found')
    return validate_tool_arguments(tool, tool_call)


def validate_tool_arguments(tool: ToolDefinition, tool_call: ToolCallContent) -> dict[str, Any]:
    arguments = copy.deepcopy(tool_call.arguments)
    normalized_arguments = _validate_schema(
        tool.parameters,
        arguments,
        path="root",
        tool_name=tool_call.name,
    )
    if not isinstance(normalized_arguments, dict):
        raise ValueError(
            f'Validation failed for tool "{tool_call.name}": root must be an object'
        )
    _validate_with_jsonschema(
        tool.parameters,
        normalized_arguments,
        tool_name=tool_call.name,
    )
    return normalized_arguments


def _validate_schema(schema: dict[str, Any], value: Any, *, path: str, tool_name: str) -> Any:
    schema_type = schema.get("type")
    if isinstance(schema_type, list):
        return _validate_union_type(schema, value, path=path, tool_name=tool_name)

    if schema_type == "object":
        if not isinstance(value, dict):
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be an object'
            )
        min_properties = schema.get("minProperties")
        if min_properties is not None and len(value) < int(min_properties):
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must contain at least {min_properties} propertie(s)'
            )
        max_properties = schema.get("maxProperties")
        if max_properties is not None and len(value) > int(max_properties):
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must contain at most {max_properties} propertie(s)'
            )
        required = schema.get("required", [])
        for field_name in required:
            if field_name not in value:
                raise ValueError(
                    f'Validation failed for tool "{tool_name}": {path}.{field_name} is required'
                )
        properties = schema.get("properties", {})
        allow_additional = schema.get("additionalProperties", True)
        normalized: dict[str, Any] = {}
        for field_name, field_value in value.items():
            field_schema = properties.get(field_name)
            if field_schema:
                normalized[field_name] = _validate_schema(
                    field_schema,
                    field_value,
                    path=f"{path}.{field_name}",
                    tool_name=tool_name,
                )
            elif allow_additional is False:
                raise ValueError(
                    f'Validation failed for tool "{tool_name}": {path}.{field_name} is not allowed'
                )
            elif isinstance(allow_additional, dict):
                normalized[field_name] = _validate_schema(
                    allow_additional,
                    field_value,
                    path=f"{path}.{field_name}",
                    tool_name=tool_name,
                )
            else:
                normalized[field_name] = field_value
        return normalized

    if schema_type == "array":
        if not isinstance(value, list):
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be an array'
            )
        item_schema = schema.get("items")
        normalized_items = []
        if item_schema:
            for index, item in enumerate(value):
                normalized_items.append(_validate_schema(
                    item_schema,
                    item,
                    path=f"{path}[{index}]",
                    tool_name=tool_name,
                ))
        else:
            normalized_items = list(value)
        min_items = schema.get("minItems")
        if min_items is not None and len(value) < int(min_items):
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must contain at least {min_items} item(s)'
            )
        max_items = schema.get("maxItems")
        if max_items is not None and len(value) > int(max_items):
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must contain at most {max_items} item(s)'
            )
        return normalized_items

    if schema_type == "string":
        if value is None:
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be a string'
            )
        coerced = value if isinstance(value, str) else str(value)
        if not isinstance(coerced, str):
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be a string'
            )
        min_length = schema.get("minLength")
        if min_length is not None and len(coerced) < int(min_length):
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be at least {min_length} characters'
            )
        max_length = schema.get("maxLength")
        if max_length is not None and len(coerced) > int(max_length):
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be at most {max_length} characters'
            )
        pattern = schema.get("pattern")
        if pattern is not None and re.search(str(pattern), coerced) is None:
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must match pattern {pattern}'
            )
        enum_values = schema.get("enum")
        if enum_values is not None and coerced not in enum_values:
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be one of {enum_values}'
            )
        return coerced

    if schema_type == "integer":
        coerced = _coerce_integer(value)
        if coerced is None:
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be an integer'
            )
        minimum = schema.get("minimum")
        if minimum is not None and coerced < minimum:
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be at least {minimum}'
            )
        maximum = schema.get("maximum")
        if maximum is not None and coerced > maximum:
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be at most {maximum}'
            )
        return coerced

    if schema_type == "number":
        coerced = _coerce_number(value)
        if coerced is None:
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be a number'
            )
        minimum = schema.get("minimum")
        if minimum is not None and coerced < minimum:
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be at least {minimum}'
            )
        maximum = schema.get("maximum")
        if maximum is not None and coerced > maximum:
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be at most {maximum}'
            )
        return coerced

    if schema_type == "boolean":
        coerced = _coerce_boolean(value)
        if coerced is None:
            raise ValueError(
                f'Validation failed for tool "{tool_name}": {path} must be a boolean'
            )
        return coerced

    enum_values = schema.get("enum")
    if enum_values is not None and value not in enum_values:
        raise ValueError(
            f'Validation failed for tool "{tool_name}": {path} must be one of {enum_values}'
        )
    return value


def _coerce_integer(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith(("+", "-")):
            sign = stripped[0]
            digits = stripped[1:]
            if digits.isdigit():
                return int(sign + digits)
        elif stripped.isdigit():
            return int(stripped)
    return None


def _coerce_number(value: Any) -> float | int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        try:
            parsed = float(stripped)
        except ValueError:
            return None
        return int(parsed) if parsed.is_integer() else parsed
    return None


def _coerce_boolean(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        stripped = value.strip().lower()
        if stripped == "true":
            return True
        if stripped == "false":
            return False
    return None


def _validate_union_type(schema: dict[str, Any], value: Any, *, path: str, tool_name: str) -> Any:
    schema_types = schema.get("type", [])
    if not isinstance(schema_types, list):
        return _validate_schema(schema, value, path=path, tool_name=tool_name)

    if value is None and "null" in schema_types:
        return None

    errors: list[str] = []
    for entry in schema_types:
        if entry == "null":
            continue
        candidate_schema = dict(schema)
        candidate_schema["type"] = entry
        try:
            return _validate_schema(candidate_schema, value, path=path, tool_name=tool_name)
        except ValueError as exc:
            errors.append(str(exc))

    allowed = ", ".join(str(item) for item in schema_types)
    if errors:
        raise ValueError(
            f'Validation failed for tool "{tool_name}": {path} must match one of [{allowed}]'
        )
    raise ValueError(
        f'Validation failed for tool "{tool_name}": {path} must match one of [{allowed}]'
    )


def _validate_with_jsonschema(schema: dict[str, Any], value: Any, *, tool_name: str) -> None:
    if Draft202012Validator is None:
        return

    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = list(validator.iter_errors(value))
    if not errors:
        return

    errors.sort(key=lambda err: list(err.absolute_path))
    raise ValueError(_format_jsonschema_error(errors[0], tool_name))


def _format_jsonschema_error(error: Any, tool_name: str) -> str:
    path = _jsonschema_path(error)
    validator = getattr(error, "validator", None)

    if validator == "required":
        missing_property = error.message.split("'")[1]
        return f'Validation failed for tool "{tool_name}": {path}.{missing_property} is required'

    if validator == "additionalProperties":
        property_name = error.message.split("'")[1]
        return f'Validation failed for tool "{tool_name}": {path}.{property_name} is not allowed'

    if validator == "minLength":
        return f'Validation failed for tool "{tool_name}": {path} must be at least {error.validator_value} characters'

    if validator == "maxLength":
        return f'Validation failed for tool "{tool_name}": {path} must be at most {error.validator_value} characters'

    if validator == "minimum":
        return f'Validation failed for tool "{tool_name}": {path} must be at least {error.validator_value}'

    if validator == "maximum":
        return f'Validation failed for tool "{tool_name}": {path} must be at most {error.validator_value}'

    if validator == "minItems":
        return f'Validation failed for tool "{tool_name}": {path} must contain at least {error.validator_value} item(s)'

    if validator == "maxItems":
        return f'Validation failed for tool "{tool_name}": {path} must contain at most {error.validator_value} item(s)'

    if validator == "minProperties":
        return f'Validation failed for tool "{tool_name}": {path} must contain at least {error.validator_value} propertie(s)'

    if validator == "maxProperties":
        return f'Validation failed for tool "{tool_name}": {path} must contain at most {error.validator_value} propertie(s)'

    if validator == "pattern":
        return f'Validation failed for tool "{tool_name}": {path} must match pattern {error.validator_value}'

    if validator == "enum":
        return f'Validation failed for tool "{tool_name}": {path} must be one of {list(error.validator_value)}'

    if validator == "format":
        return f'Validation failed for tool "{tool_name}": {path} must match format {error.validator_value}'

    if validator == "type":
        expected = error.validator_value
        if isinstance(expected, list):
            expected = ", ".join(str(item) for item in expected)
        article = "an" if str(expected).startswith(("a", "e", "i", "o", "u")) else "a"
        return f'Validation failed for tool "{tool_name}": {path} must be {article} {expected}'

    return f'Validation failed for tool "{tool_name}": {path} {error.message}'


def _jsonschema_path(error: Any) -> str:
    path = "root"
    for part in list(getattr(error, "absolute_path", [])):
        if isinstance(part, int):
            path += f"[{part}]"
        else:
            path += f".{part}"
    return path
