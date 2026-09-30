#!/usr/bin/env node

/**
 * Translation parity check script
 * Ensures all locales have the same keys as the source locale (en)
 */

const fs = require('fs');
const path = require('path');

const MESSAGES_DIR = path.join(__dirname, '../messages');
const SOURCE_LOCALE = 'en';

function flattenObject(obj, prefix = '') {
  const flattened = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        Object.assign(flattened, flattenObject(obj[key], newKey));
      } else {
        flattened[newKey] = obj[key];
      }
    }
  }
  
  return flattened;
}

function loadMessages(locale) {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Messages file not found for locale: ${locale}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function checkTranslations() {
  const sourceMessages = loadMessages(SOURCE_LOCALE);
  const sourceKeys = Object.keys(flattenObject(sourceMessages)).sort();
  
  console.log(`🔍 Checking translations against source locale: ${SOURCE_LOCALE}`);
  console.log(`📊 Source locale has ${sourceKeys.length} keys`);
  
  const localeFiles = fs.readdirSync(MESSAGES_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => path.basename(file, '.json'))
    .filter(locale => locale !== SOURCE_LOCALE);
  
  let hasErrors = false;
  
  for (const locale of localeFiles) {
    console.log(`\n📝 Checking ${locale}...`);
    
    try {
      const messages = loadMessages(locale);
      const keys = Object.keys(flattenObject(messages)).sort();
      
      // Find missing keys
      const missingKeys = sourceKeys.filter(key => !keys.includes(key));
      
      // Find extra keys
      const extraKeys = keys.filter(key => !sourceKeys.includes(key));
      
      if (missingKeys.length === 0 && extraKeys.length === 0) {
        console.log(`✅ ${locale}: All keys match (${keys.length} keys)`);
      } else {
        hasErrors = true;
        console.log(`❌ ${locale}: Found issues`);
        
        if (missingKeys.length > 0) {
          console.log(`   Missing ${missingKeys.length} keys:`);
          missingKeys.slice(0, 10).forEach(key => {
            console.log(`     - ${key}`);
          });
          if (missingKeys.length > 10) {
            console.log(`     ... and ${missingKeys.length - 10} more`);
          }
        }
        
        if (extraKeys.length > 0) {
          console.log(`   Extra ${extraKeys.length} keys:`);
          extraKeys.slice(0, 10).forEach(key => {
            console.log(`     + ${key}`);
          });
          if (extraKeys.length > 10) {
            console.log(`     ... and ${extraKeys.length - 10} more`);
          }
        }
      }
    } catch (error) {
      hasErrors = true;
      console.log(`❌ ${locale}: Error loading messages - ${error.message}`);
    }
  }
  
  if (hasErrors) {
    console.log('\n❌ Translation check failed. Some locales have missing or extra keys.');
    process.exit(1);
  } else {
    console.log('\n✅ All translations are in sync!');
  }
}

// Run the check
checkTranslations();