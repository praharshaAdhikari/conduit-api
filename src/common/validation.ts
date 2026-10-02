import { ValidationError, ValidationPipe } from '@nestjs/common';
import { ErrorFields, invalid } from './api-error';

export const BLANK = "can't be blank";

// Request bodies are wrapped ({ "user": { ... } }), so errors are reported
// under the innermost property name: { "errors": { "email": [...] } }.
export function toErrorFields(errors: ValidationError[]): ErrorFields {
  const fields: ErrorFields = {};

  const visit = (error: ValidationError) => {
    const messages = Object.values(error.constraints ?? {});
    if (messages.length > 0) {
      // "can't be blank" first, so an empty value is not reported as malformed.
      messages.sort((a, b) => Number(b === BLANK) - Number(a === BLANK));
      fields[error.property] = [...(fields[error.property] ?? []), ...messages];
    }
    error.children?.forEach(visit);
  };

  errors.forEach(visit);
  return fields;
}

export function validationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    exceptionFactory: (errors) => invalid(toErrorFields(errors)),
  });
}
