// ========================================
// INVOICE PROCESSOR - GOOGLE APPS SCRIPT
// Sistema de procesamiento automatizado de facturas
// con Gemini 1.5 Flash y Notion
// ========================================

// Variables de configuración (Propiedades del Script)
// - GEMINI_API_KEY: API Key de Google AI Studio
// - NOTION_API_KEY: Token de integración de Notion
// - NOTION_DATABASE_ID: ID de la base de datos de Notion
// - DRIVE_FOLDER_ID: ID de la carpeta de Google Drive

const DRIVE_FOLDER_ID = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
const NOTION_API_KEY = PropertiesService.getScriptProperties().getProperty('NOTION_API_KEY');
const NOTION_DATABASE_ID = PropertiesService.getScriptProperties().getProperty('NOTION_DATABASE_ID');

// Función principal que se ejecuta periódicamente
function processNewInvoices() {
  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const files = folder.getFiles();
    
    while (files.hasNext()) {
      const file = files.next();
      
      // Verificar si ya fue procesado
      if (!isFileProcessed(file.getId())) {
        Logger.log('Procesando factura: ' + file.getName());
        
        const invoiceData = extractInvoiceData(file);
        
        if (invoiceData) {
          sendToNotion(invoiceData, file);
          markAsProcessed(file.getId());
          Logger.log('Factura procesada exitosamente: ' + file.getName());
        }
      }
    }
  } catch (error) {
    Logger.log('Error: ' + error.toString());
  }
}

// Extraer información usando Gemini 1.5 Flash
function extractInvoiceData(file) {
  try {
    const blob = file.getBlob();
    const base64Image = Utilities.base64Encode(blob.getBytes());
    const mimeType = blob.getContentType();
    
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    const model = 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{
        parts: [
          {
            text: 'Extrae la siguiente información de esta factura: Emisor, RUT Emisor, Número de Factura, Fecha Emisión, Monto Total, Estado. Responde en formato JSON.'
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image
            }
          }
        ]
      }]
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.candidates && result.candidates[0]) {
      const text = result.candidates[0].content.parts[0].text;
      return JSON.parse(text);
    }
    
    return null;
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return null;
  }
}

// Enviar datos a Notion
function sendToNotion(data, file) {
  try {
    const payload = {
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        'Emisor': {
          title: [{ text: { content: data.Emisor || 'N/A' } }]
        },
        'RUT Emisor': {
          rich_text: [{ text: { content: data.RUTEmisor || 'N/A' } }]
        },
        'Número Factura': {
          rich_text: [{ text: { content: String(data.NumeroFactura || 'N/A') } }]
        },
        'Fecha Emisión': {
          date: { start: data.FechaEmision || null }
        },
        'Monto Total': {
          number: data.total || 0
        },
        'Estado': {
          select: { name: 'Procesada' }
        },
        'Archivo': {
          url: file.getUrl()
        }
      }
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + NOTION_API_KEY,
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
    Logger.log('Respuesta de Notion: ' + response.getContentText());
  } catch (error) {
    Logger.log('Error al enviar a Notion: ' + error.toString());
    throw error;
  }
}

// Verificar si un archivo ya fue procesado
function isFileProcessed(fileId) {
  const processedFiles = PropertiesService.getScriptProperties().getProperty('processedFiles') || '{}';
  const files = JSON.parse(processedFiles);
  return files[fileId] === true;
}

// Marcar archivo como procesado
function markAsProcessed(fileId) {
  const processedFiles = PropertiesService.getScriptProperties().getProperty('processedFiles') || '{}';
  const files = JSON.parse(processedFiles);
  files[fileId] = true;
  PropertiesService.getScriptProperties().setProperty('processedFiles', JSON.stringify(files));
}

// Función de prueba para verificar conexión con Drive
function testDriveConnection() {
  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    Logger.log('Conexión con Drive exitosa!');
    Logger.log('Carpeta: ' + folder.getName());
    return true;
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return false;
  }
}

// Función para obtener facturas de Notion (para el dashboard)
function getNotionInvoices() {
  try {
    const url = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + NOTION_API_KEY,
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify({
        sorts: [{
          property: 'Fecha Emisión',
          direction: 'descending'
        }]
      }),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    return result.results || [];
  } catch (error) {
    Logger.log('Error en getNotionInvoices: ' + error.toString());
    throw error;
  }
}
