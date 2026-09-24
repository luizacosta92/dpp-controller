/**
 * DPP CONTROLLER - GOOGLE APPS SCRIPT
 * Integração entre Google Sheets e Firebase Firestore
 * 
 * INSTRUÇÕES:
 * 1. Cole este código no editor do Apps Script (Extensões > Apps Script na sua planilha).
 * 2. Atualize a constante WEBHOOK_URL abaixo com a URL da sua Cloud Function syncPatientData.
 * 3. Salve (Ctrl + S).
 * 4. Recarregue a planilha e use o novo menu "DPP Controller" no topo!
 */

// URL da Cloud Function syncPatientData no Firebase
// Exemplo: "https://us-central1-dpp-controller.cloudfunctions.net/syncPatientData"
const WEBHOOK_URL = "https://us-central1-dpp-controller.cloudfunctions.net/syncPatientData";

/**
 * Cria o menu personalizado na barra de ferramentas da planilha
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('👶 DPP Controller')
    .addItem('🚀 Sincronizar Todas as Gestantes (Ativas)', 'syncAllPatients')
    .addItem('📌 Sincronizar Linha Selecionada', 'syncSelectedRow')
    .addSeparator()
    .addItem('⚙️ Configurar Gatilho Automático (Novos Envios)', 'installTrigger')
    .addToUi();
}

/**
 * Sincroniza todas as linhas da planilha com o PWA
 */
function syncAllPatients() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert('A planilha está vazia ou contém apenas o cabeçalho.');
    return;
  }

  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const headerMap = getHeaderMap(headers);
  
  // Garantir que a coluna de status de sincronização exista
  let syncColIndex = headers.indexOf('status sincronização app') + 1;
  if (syncColIndex === 0) {
    syncColIndex = headers.length + 1;
    sheet.getRange(1, syncColIndex).setValue('Status Sincronização App').setFontWeight('bold');
  }

  const patientsToSync = [];
  const rowsToUpdate = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowNumber = i + 1;

    // Se a linha estiver totalmente vazia, pula
    const name = getColVal(row, headerMap.name);
    if (!name || String(name).trim() === '') continue;

    // Status: se explicitamente Finalizado, envia Finalizado. Se vazio ou Acompanhando, envia Acompanhando
    let rawStatus = getColVal(row, headerMap.status);
    rawStatus = String(rawStatus || '').trim().toLowerCase();
    
    const targetStatus = rawStatus === 'finalizado' ? 'Finalizado' : 'Acompanhando';

    const patient = extractPatientFromRow(row, headerMap, rowNumber);
    patient.status = targetStatus;

    patientsToSync.push(patient);
    rowsToUpdate.push({ rowNumber, status: targetStatus });
  }

  if (patientsToSync.length === 0) {
    SpreadsheetApp.getUi().alert('Nenhuma gestante encontrada para sincronizar.');
    return;
  }

  // Enviar cada gestante individualmente em paralelo (compatível com a Cloud Function atual em produção)
  const requests = patientsToSync.map(patient => ({
    url: WEBHOOK_URL,
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(patient),
    muteHttpExceptions: true
  }));

  const responses = UrlFetchApp.fetchAll(requests);
  const now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm");

  let activeCount = 0;
  let finalizedCount = 0;
  let failCount = 0;

  for (let j = 0; j < responses.length; j++) {
    const res = responses[j];
    const rowInfo = rowsToUpdate[j];
    const code = res.getResponseCode();

    if (code >= 200 && code < 300) {
      const tag = rowInfo.status === 'Finalizado' ? 'Histórico (Finalizado)' : 'Ativo (Acompanhando)';
      sheet.getRange(rowInfo.rowNumber, syncColIndex).setValue(`${tag} - ${now}`);
      if (rowInfo.status === 'Finalizado') {
        finalizedCount++;
      } else {
        activeCount++;
      }
    } else {
      const errText = res.getContentText();
      sheet.getRange(rowInfo.rowNumber, syncColIndex).setValue(`Erro ${code}: ${errText}`);
      failCount++;
    }
  }

  if (failCount === 0) {
    SpreadsheetApp.getUi().alert(`Sucesso! Sincronização concluída:\n\n• ${activeCount} gestante(s) ativas no painel principal ("Acompanhando").\n• ${finalizedCount} acompanhamento(s) finalizados no histórico ("Finalizado").`);
  } else {
    SpreadsheetApp.getUi().alert(`Sincronização finalizada com avisos:\n- ${activeCount + finalizedCount} sincronizadas.\n- ${failCount} falhas.\n\nVerifique a coluna "Status Sincronização App" na planilha para ver os detalhes.`);
  }
}

/**
 * Sincroniza apenas a linha atualmente selecionada pelo usuário
 */
function syncSelectedRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const rowNumber = sheet.getActiveCell().getRow();
  
  if (rowNumber < 2) {
    SpreadsheetApp.getUi().alert('Por favor, selecione uma linha com dados de uma gestante (não o cabeçalho).');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
  const headerMap = getHeaderMap(headers);
  const rowData = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];

  const name = getColVal(rowData, headerMap.name);
  if (!name || String(name).trim() === '') {
    SpreadsheetApp.getUi().alert('A linha selecionada não possui nome da gestante.');
    return;
  }

  let syncColIndex = headers.indexOf('status sincronização app') + 1;
  if (syncColIndex === 0) {
    syncColIndex = headers.length + 1;
    sheet.getRange(1, syncColIndex).setValue('Status Sincronização App').setFontWeight('bold');
  }

  const patient = extractPatientFromRow(rowData, headerMap, rowNumber);
  // Se status vazio, define Acompanhando
  let status = getColVal(rowData, headerMap.status);
  status = String(status || '').trim();
  patient.status = status === '' ? 'Acompanhando' : status;

  const response = sendToFirebase(patient);
  const now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm");

  if (response.success) {
    sheet.getRange(rowNumber, syncColIndex).setValue(`Sincronizado (${now})`);
    SpreadsheetApp.getUi().alert(`Gestante "${patient.name}" sincronizada com sucesso!`);
  } else {
    sheet.getRange(rowNumber, syncColIndex).setValue(`Erro: ${response.message}`);
    SpreadsheetApp.getUi().alert(`Erro ao sincronizar: ${response.message}`);
  }
}

/**
 * Gatilho automático executado sempre que um novo formulário for enviado
 */
function onFormSubmitTrigger(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const rowNumber = e.range ? e.range.getRow() : sheet.getLastRow();
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
    const headerMap = getHeaderMap(headers);
    const rowData = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];

    const patient = extractPatientFromRow(rowData, headerMap, rowNumber);
    let rawStatus = getColVal(rowData, headerMap.status);
    rawStatus = String(rawStatus || '').trim().toLowerCase();
    patient.status = rawStatus === 'finalizado' ? 'Finalizado' : 'Acompanhando';

    let syncColIndex = headers.indexOf('status sincronização app') + 1;
    if (syncColIndex === 0) {
      syncColIndex = headers.length + 1;
      sheet.getRange(1, syncColIndex).setValue('Status Sincronização App').setFontWeight('bold');
    }

    const response = sendToFirebase(patient);
    const now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm");

    if (response.success) {
      sheet.getRange(rowNumber, syncColIndex).setValue(`Sincronizado (${now})`);
    } else {
      sheet.getRange(rowNumber, syncColIndex).setValue(`Erro: ${response.message}`);
    }
  } catch (err) {
    console.error("Erro no gatilho onFormSubmitTrigger:", err);
  }
}

/**
 * Configura o gatilho instalável onFormSubmit automaticamente
 */
function installTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const triggers = ScriptApp.getProjectTriggers();
  
  // Evitar duplicidade de gatilhos
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onFormSubmitTrigger') {
      SpreadsheetApp.getUi().alert('O gatilho automático de envio de formulário já está instalado e ativo.');
      return;
    }
  }

  ScriptApp.newTrigger('onFormSubmitTrigger')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  SpreadsheetApp.getUi().alert('Gatilho configurado com sucesso! Todo novo formulário preenchido será enviado automaticamente ao PWA.');
}

/**
 * Extrai os dados do paciente com base no mapa de cabeçalhos
 */
function extractPatientFromRow(row, map, rowNumber) {
  return {
    id: String(rowNumber),
    name: String(getColVal(row, map.name) || ''),
    babyName: String(getColVal(row, map.babyName) || ''),
    dum: formatDateVal(getColVal(row, map.dum)),
    dpp: formatDateVal(getColVal(row, map.dpp)),
    bloodType: String(getColVal(row, map.bloodType) || ''),
    phone: String(getColVal(row, map.phone) || ''),
    rg: String(getColVal(row, map.rg) || ''),
    cpf: String(getColVal(row, map.cpf) || ''),
    birthDate: formatDateVal(getColVal(row, map.birthDate)),
    age: getColVal(row, map.age) || '',
    birthPlace: String(getColVal(row, map.birthPlace) || ''),
    profession: String(getColVal(row, map.profession) || ''),
    education: String(getColVal(row, map.education) || ''),
    maritalStatus: String(getColVal(row, map.maritalStatus) || ''),
    location: String(getColVal(row, map.location) || ''),
    zipcode: String(getColVal(row, map.zipcode) || ''),
    cityState: String(getColVal(row, map.cityState) || ''),
    spouse: String(getColVal(row, map.spouse) || ''),
    spouseEmail: String(getColVal(row, map.spouseEmail) || ''),
    spouseRg: String(getColVal(row, map.spouseRg) || ''),
    spouseCpf: String(getColVal(row, map.spouseCpf) || ''),
    spouseBirthDate: formatDateVal(getColVal(row, map.spouseBirthDate)),
    spouseAge: getColVal(row, map.spouseAge) || '',
    spouseBirthPlace: String(getColVal(row, map.spouseBirthPlace) || ''),
    spouseProfession: String(getColVal(row, map.spouseProfession) || ''),
    spouseEducation: String(getColVal(row, map.spouseEducation) || ''),
    spouseMaritalStatus: String(getColVal(row, map.spouseMaritalStatus) || ''),
    spouseAddress: String(getColVal(row, map.spouseAddress) || ''),
    spouseZipcode: String(getColVal(row, map.spouseZipcode) || ''),
    spouseCityState: String(getColVal(row, map.spouseCityState) || ''),
    howDidYouKnow: String(getColVal(row, map.howDidYouKnow) || ''),
    birthLocation: String(getColVal(row, map.birthLocation) || ''),
    email: String(getColVal(row, map.email) || '')
  };
}

/**
 * Envia payload para a Cloud Function do Firebase
 */
function sendToFirebase(payload) {
  if (!WEBHOOK_URL || WEBHOOK_URL.includes('SUA_URL_AQUI')) {
    return { success: false, message: 'URL do Webhook não configurada no script.' };
  }

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const code = response.getResponseCode();
    const content = response.getContentText();

    if (code >= 200 && code < 300) {
      return { success: true };
    } else {
      return { success: false, message: `Status ${code}: ${content}` };
    }
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * Mapeia os índices das colunas a partir dos títulos
 */
function getHeaderMap(headers) {
  const map = {};
  
  headers.forEach((h, idx) => {
    if (h.includes('nome da gestante')) map.name = idx;
    else if (h.includes('nome do beb')) map.babyName = idx;
    else if (h.includes('dpp')) map.dpp = idx;
    else if (h.includes('dum')) map.dum = idx;
    else if (h.includes('tipo sangu')) map.bloodType = idx;
    else if (h.includes('telefone')) map.phone = idx;
    else if (h.includes('email address') || h === 'email') map.email = idx;
    else if (h.includes('local do parto')) map.birthLocation = idx;
    else if (h.includes('como conheceu')) map.howDidYouKnow = idx;
    else if (h === 'status' || (h.includes('status') && !h.includes('sincroniz') && !h.includes('app'))) map.status = idx;
    
    // Cônjuge vs Gestante
    else if (h.includes('companheiro') || h.includes('acompanhante')) {
      if (h.includes('email')) map.spouseEmail = idx;
      else if (h.includes('rg')) map.spouseRg = idx;
      else if (h.includes('cpf') || h.includes('passaporte')) map.spouseCpf = idx;
      else if (h.includes('nascimento')) map.spouseBirthDate = idx;
      else if (h.includes('idade')) map.spouseAge = idx;
      else if (h.includes('naturalidade')) map.spouseBirthPlace = idx;
      else if (h.includes('profiss')) map.spouseProfession = idx;
      else if (h.includes('escolaridade')) map.spouseEducation = idx;
      else if (h.includes('estado civil')) map.spouseMaritalStatus = idx;
      else if (h.includes('endereço') || h.includes('endereco')) map.spouseAddress = idx;
      else if (h.includes('cep')) map.spouseZipcode = idx;
      else if (h.includes('cidade/estado') || h.includes('cidade')) map.spouseCityState = idx;
      else map.spouse = idx; // Nome do companheiro
    }
    // Gestante (primeira ocorrência)
    else {
      if (h.includes('rg') && map.rg === undefined) map.rg = idx;
      else if ((h.includes('cpf') || h.includes('passaporte')) && map.cpf === undefined) map.cpf = idx;
      else if (h.includes('nascimento') && map.birthDate === undefined) map.birthDate = idx;
      else if (h.includes('idade') && map.age === undefined) map.age = idx;
      else if (h.includes('naturalidade') && map.birthPlace === undefined) map.birthPlace = idx;
      else if (h.includes('profiss') && map.profession === undefined) map.profession = idx;
      else if (h.includes('escolaridade') && map.education === undefined) map.education = idx;
      else if (h.includes('estado civil') && map.maritalStatus === undefined) map.maritalStatus = idx;
      else if ((h.includes('endereço') || h.includes('endereco')) && map.location === undefined) map.location = idx;
      else if (h.includes('cep') && map.zipcode === undefined) map.zipcode = idx;
      else if ((h.includes('cidade/estado') || h.includes('cidade')) && map.cityState === undefined) map.cityState = idx;
    }
  });

  return map;
}

function getColVal(row, colIdx) {
  if (colIdx === undefined || colIdx === null || colIdx < 0) return '';
  return row[colIdx];
}

function formatDateVal(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, "America/Sao_Paulo", "dd/MM/yyyy");
  }
  return String(val).trim();
}
