/** Registry of the concrete language implementations shipped with this tool. */
import { dotnetValidation } from './dotnet-validation.js'
import type { Language } from './identity.js'
import type { LanguageValidation } from './language-validation.js'

const validators: Record<Language, LanguageValidation> = { dotnet: dotnetValidation, }

export function validationAdapter (language: Language): LanguageValidation {
  return validators[language]
}
