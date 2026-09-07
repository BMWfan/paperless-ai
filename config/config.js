const path = require('path');
const currentDir = decodeURIComponent(process.cwd());
const envPath = path.join(currentDir, 'data', '.env');
console.log('Loading .env from:', envPath); // Debug log
require('dotenv').config({ path: envPath });

// Helper function to parse boolean-like env vars
const parseEnvBoolean = (value, defaultValue = 'yes') => {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes' ? 'yes' : 'no';
};

// Initialize limit functions with defaults
const limitFunctions = {
  activateTagging: parseEnvBoolean(process.env.ACTIVATE_TAGGING, 'yes'),
  activateCorrespondents: parseEnvBoolean(process.env.ACTIVATE_CORRESPONDENTS, 'yes'),
  activateDocumentType: parseEnvBoolean(process.env.ACTIVATE_DOCUMENT_TYPE, 'yes'),
  activateTitle: parseEnvBoolean(process.env.ACTIVATE_TITLE, 'yes'),
  activateCustomFields: parseEnvBoolean(process.env.ACTIVATE_CUSTOM_FIELDS, 'yes')
};

// Initialize AI restrictions with defaults
const aiRestrictions = {
  restrictToExistingTags: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_TAGS, 'no'),
  restrictToExistingCorrespondents: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_CORRESPONDENTS, 'no'),
  restrictToExistingDocumentTypes: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_DOCUMENT_TYPES, 'no')
};

console.log('Loaded restriction settings:', {
  RESTRICT_TO_EXISTING_TAGS: aiRestrictions.restrictToExistingTags,
  RESTRICT_TO_EXISTING_CORRESPONDENTS: aiRestrictions.restrictToExistingCorrespondents,
  RESTRICT_TO_EXISTING_DOCUMENT_TYPES: aiRestrictions.restrictToExistingDocumentTypes
});

// Initialize external API configuration
const externalApiConfig = {
  enabled: parseEnvBoolean(process.env.EXTERNAL_API_ENABLED, 'no'),
  url: process.env.EXTERNAL_API_URL || '',
  method: process.env.EXTERNAL_API_METHOD || 'GET',
  headers: process.env.EXTERNAL_API_HEADERS || '{}',
  body: process.env.EXTERNAL_API_BODY || '{}',
  timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT || '5000', 10),
  transformationTemplate: process.env.EXTERNAL_API_TRANSFORM || ''
};

console.log('Loaded environment variables:', {
  PAPERLESS_API_URL: process.env.PAPERLESS_API_URL,
  PAPERLESS_API_TOKEN: '******',
  LIMIT_FUNCTIONS: limitFunctions,
  AI_RESTRICTIONS: aiRestrictions,
  EXTERNAL_API: externalApiConfig.enabled === 'yes' ? 'enabled' : 'disabled'
});

module.exports = {
  PAPERLESS_AI_VERSION: '3.0.9',
  CONFIGURED: false,
  disableAutomaticProcessing: process.env.DISABLE_AUTOMATIC_PROCESSING || 'no',
  predefinedMode: process.env.PROCESS_PREDEFINED_DOCUMENTS,
  tokenLimit: process.env.TOKEN_LIMIT || 128000,
  responseTokens: process.env.RESPONSE_TOKENS || 1000,
  addAIProcessedTag: process.env.ADD_AI_PROCESSED_TAG || 'no',
  addAIProcessedTags: process.env.AI_PROCESSED_TAG_NAME || 'ai-processed',
  // AI restrictions config
  restrictToExistingTags: aiRestrictions.restrictToExistingTags,
  restrictToExistingCorrespondents: aiRestrictions.restrictToExistingCorrespondents,
  restrictToExistingDocumentTypes: aiRestrictions.restrictToExistingDocumentTypes,
  // External API config
  externalApiConfig: externalApiConfig,
  paperless: {
    apiUrl: process.env.PAPERLESS_API_URL,
    apiToken: process.env.PAPERLESS_API_TOKEN
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },
  ollama: {
    apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2'
  },
  custom: {
    apiUrl: process.env.CUSTOM_BASE_URL || '',
    apiKey: process.env.CUSTOM_API_KEY || '',
    model: process.env.CUSTOM_MODEL || ''
  },
  azure: {
    apiKey: process.env.AZURE_API_KEY || '',
    endpoint: process.env.AZURE_ENDPOINT || '',
    deploymentName: process.env.AZURE_DEPLOYMENT_NAME || '',
    apiVersion: process.env.AZURE_API_VERSION || '2023-05-15'
  },
  customFields: process.env.CUSTOM_FIELDS || '',
  aiProvider: process.env.AI_PROVIDER || 'openai',
  scanInterval: process.env.SCAN_INTERVAL || '*/30 * * * *',
  useExistingData: process.env.USE_EXISTING_DATA || 'no',
  // Add limit functions to config
  limitFunctions: {
    activateTagging: limitFunctions.activateTagging,
    activateCorrespondents: limitFunctions.activateCorrespondents,
    activateDocumentType: limitFunctions.activateDocumentType,
    activateTitle: limitFunctions.activateTitle,
    activateCustomFields: limitFunctions.activateCustomFields
  },
  specialPromptPreDefinedTags: `You are a document analysis AI specialized in semantic document classification.
  Analyze the document and assign ALL relevant tags, not just the single best tag.

  Tagging rules:
  - Tags are additive, not exclusive.
  - Prefer 2-5 meaningful tags instead of a single generic tag.
  - Reuse existing tags whenever possible.
  - Similar documents must receive consistent tags.
  - If multiple categories apply, include all matching tags.
  - Avoid overly broad tagging only when a more precise tag exists.

  Classification examples:
  - Salary/payroll documents: Gehalt, Finanzen, Steuer (if tax-related)
  - Amazon/shop invoices: Einkauf plus category tags like Elektronik, Haushalt, Garantie when relevant
  - Insurance documents: Versicherung and Finanzen
  - Rental contracts: Miete, Vertrag, Finanzen

  You are given a list of allowed tags: ${process.env.PROMPT_TAGS}
  Only use tags from this list.
  You do not ask for additional information and only use information contained in the document.

  Return the result EXCLUSIVELY as a JSON object. The Tags and Title MUST be in the language that is used in the document:
  {
    "title": "xxxxx",
    "correspondent": "xxxxxxxx",
    "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
    "document_date": "YYYY-MM-DD",
    "language": "en/de/es/..."
  }`,
  mustHavePrompt: `You are a semantic document classification AI.
  Your task is to classify documents consistently and assign ALL relevant tags.

  Important tagging behavior:
  - Tags are additive and multiple tags are expected.
  - Prefer meaningful combinations of tags instead of only one broad tag.
  - Usually assign between 2 and 5 tags if enough context exists.
  - Similar documents must always receive similar tag combinations.
  - Reuse existing tags whenever possible.
  - Do not invent unnecessary new tags.
  - It is better to assign one additional relevant tag than to miss an important category.

  Classification guidance:
  - Salary/payroll documents => Gehalt (+ Steuer only if tax-related)
  - Amazon/shop invoices => Einkauf + category tags such as Elektronik, Haushalt, Garantie when applicable
  - Insurance documents => Versicherung (+ Auto or Gesundheit if relevant)
  - Contracts => Vertrag + related topic tags
  - Bank statements => Bank/Konto
  - Subscription services => Abo + related service category

  Preferred stable tag taxonomy:
  - Einkauf
  - Elektronik
  - Garantie
  - Haushalt
  - Gehalt
  - Steuer
  - Versicherung
  - Vertrag
  - Miete
  - Gesundheit
  - Auto
  - Rechnung
  - Quittung
  - Abo
  - Bank/Konto

  Avoid overly generic tags.
  Do not use Finanzen as a catch-all category.

  Golden examples:
  - Amazon laptop invoice => Einkauf + Elektronik + Garantie + Rechnung
  - Amazon kitchen item => Einkauf + Haushalt + Rechnung
  - Payroll statement => Gehalt
  - Tax document => Steuer
  - Car insurance => Versicherung + Auto
  - Rental agreement => Vertrag + Miete

  IMPORTANT:
  - The custom_fields are optional and can be left out if not needed.
  - Only fill out values if matching information exists in the document.
  - Do not change field_name values.
  - Monetary values must contain only the numeric value and use '.' as decimal separator.

  Return the result EXCLUSIVELY as a JSON object. The Tags, Title and Document_Type MUST be in the language that is used in the document:
  {
    "title": "xxxxx",
    "correspondent": "xxxxxxxx",
    "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
    "document_type": "Invoice/Contract/...",
    "document_date": "YYYY-MM-DD",
    "language": "en/de/es/...",
    %CUSTOMFIELDS%
  }`,
};
