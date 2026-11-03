'use strict';
// The evaluation document is generated separately and never preloaded as training data.
module.exports = function generate(index = 1, language = 'en') {
  const content = language === 'de'
    ? `Fiktive Beispiel GmbH\nRechnung SYN-${index}\nNur synthetische Testdaten. Betrag: 42 EUR.`
    : `Fictional Acme\nInvoice SYN-${index}\nSynthetic test data only. Amount: EUR 42.`;
  return { name: `synthetic-${language}-${index}.txt`, content,
    expected: { title: 'Synthetic invoice', correspondent: 'Fictional Acme', document_type: 'Invoice', tags: ['synthetic'] } };
};

// Stable corpus for future held-out evaluations; never seed these as learning rows.
module.exports.corpus = function corpus() {
  const types = [
    ['invoice', 'Invoice', 'Rechnung', 'Payment due: EUR 42.', 'Zu zahlen: 42 EUR.'],
    ['insurance', 'Insurance policy', 'Versicherung', 'Coverage for fictional household.', 'Versicherungsschutz für einen fiktiven Haushalt.'],
    ['contract', 'Contract', 'Vertrag', 'Agreement between fictional parties.', 'Vereinbarung zwischen fiktiven Vertragsparteien.'],
    ['letter', 'Letter', 'Brief', 'Dear fictional recipient, this is a synthetic letter.', 'Sehr geehrte fiktive Empfängerin, dies ist ein synthetischer Brief.'],
    ['payment', 'Payment confirmation', 'Zahlungsbestätigung', 'Payment received: EUR 42.', 'Zahlungseingang bestätigt: 42 EUR.']
  ];
  return types.flatMap(([kind,en,de,english,german],index) => ['en','de'].map(language => ({
    name: `evaluation-${kind}-${language}.txt`,
    content: `Fictional Example ${index+1}\n${language==='de'?de:en}\nSYNTHETIC DATA ONLY\n${language==='de'?german:english}`,
    expected: { title: `${language==='de'?de:en} ${index+1}`, document_type: en, correspondent: `Fictional Example ${index+1}`,
      language, tags: ['synthetic',kind] }
  })));
};
