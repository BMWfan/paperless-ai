'use strict';
// The evaluation document is generated separately and never preloaded as training data.
module.exports = function generate(index = 1, language = 'en') {
  const content = language === 'de'
    ? `Fiktive Beispiel GmbH\nRechnung SYN-${index}\nNur synthetische Testdaten. Betrag: 42 EUR.`
    : `Fictional Acme\nInvoice SYN-${index}\nSynthetic test data only. Amount: EUR 42.`;
  return { name: `synthetic-${language}-${index}.txt`, content,
    expected: { title: 'Synthetic invoice', correspondent: 'Fictional Acme', document_type: 'Invoice', tags: ['synthetic'] } };
};
