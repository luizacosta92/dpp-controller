import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// 1. Webhook para Sincronizar com Google Sheets
export const syncPatientData = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const body = req.body;
    if (!body) {
      res.status(400).send('Bad Request: Missing body');
      return;
    }

    // Função para normalizar datas (converte ISO/Date para dd/MM/yyyy)
    const formatIsoDate = (dateStr: any) => {
      if (dateStr && typeof dateStr === 'string' && dateStr.includes('T')) {
        try {
          const d = new Date(dateStr);
          const day = String(d.getUTCDate()).padStart(2, '0');
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          const year = d.getUTCFullYear();
          return `${day}/${month}/${year}`;
        } catch (e) {
          return dateStr;
        }
      }
      return dateStr;
    };

    // Helper para processar um único paciente
    const processPatientData = (patientRaw: any, existingDocData?: admin.firestore.DocumentData) => {
      const { id, status, ...rest } = patientRaw;
      
      const rawStatus = String(status || '').trim();
      let patientStatus = 'Acompanhando';

      if (rawStatus.toLowerCase() === 'finalizado') {
        patientStatus = 'Finalizado';
      } else if (rawStatus.toLowerCase() === 'excluido' || rawStatus.toLowerCase() === 'excluído') {
        patientStatus = 'Excluído';
      } else if (rawStatus !== '') {
        patientStatus = rawStatus;
      } else if (existingDocData && (existingDocData.status === 'Finalizado' || existingDocData.status === 'Excluído')) {
        // Se já estava finalizado ou excluído no app e a planilha não informou status, mantém o status existente
        patientStatus = existingDocData.status;
      }

      let dpp = formatIsoDate(patientRaw.dpp);
      if (rest.dum) rest.dum = formatIsoDate(rest.dum);
      if (rest.birthDate) rest.birthDate = formatIsoDate(rest.birthDate);
      if (rest.spouseBirthDate) rest.spouseBirthDate = formatIsoDate(rest.spouseBirthDate);

      // Shield local fields (evita sobrescrever alterações feitas exclusivamente no PWA)
      delete rest.dnvStatus;
      delete rest.last_edited_by;
      delete rest.last_edited_at;
      delete rest.deleted_at;

      const payload: any = {
        ...rest,
        dpp,
        status: patientStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (!existingDocData) {
        payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
        payload.dnvStatus = 'Solicitar';
      }

      return { docId: String(id), payload };
    };

    // Suporte a lote (batch de múltiplos pacientes)
    const patientsList: any[] = Array.isArray(body) ? body : (body.patients && Array.isArray(body.patients) ? body.patients : null);

    if (patientsList) {
      if (patientsList.length === 0) {
        res.status(200).send({ success: true, message: 'No patients to sync' });
        return;
      }

      const batch = db.batch();
      
      // Buscar documentos existentes em paralelo para preservar status e dnvStatus
      const docRefs = patientsList.filter(p => p && p.id && p.name).map(p => db.collection("patients").doc(String(p.id)));
      const snapshots = await db.getAll(...docRefs);
      const snapshotMap = new Map(snapshots.map(s => [s.id, s.exists ? s.data() : undefined]));

      for (const p of patientsList) {
        if (!p || !p.id || !p.name) continue;
        const existingData = snapshotMap.get(String(p.id));
        const { docId, payload } = processPatientData(p, existingData);
        const ref = db.collection("patients").doc(docId);
        batch.set(ref, payload, { merge: true });
      }

      await batch.commit();
      res.status(200).send({ success: true, count: patientsList.length, message: 'Batch patients synced successfully' });
      return;
    }

    // Suporte a envio de um único paciente
    if (!body.id || !body.name) {
      res.status(400).send('Bad Request: Missing required fields (id, name)');
      return;
    }

    const patientRef = db.collection("patients").doc(String(body.id));
    const doc = await patientRef.get();
    const existingData = doc.exists ? doc.data() : undefined;
    const { payload } = processPatientData(body, existingData);

    await patientRef.set(payload, { merge: true });
    res.status(200).send({ success: true, message: 'Patient synced successfully' });
  } catch (error) {
    console.error("Error syncing patient data:", error);
    res.status(500).send("Internal Server Error");
  }
});

// 2. Cron Job para envio de resumo semanal (Segunda 08h00)
export const weeklyNotification = functions.pubsub.schedule('0 8 * * 1')
  .timeZone('America/Sao_Paulo')
  .onRun(async (context) => {
    try {
      // Pacientes na janela de 38 a 42 semanas
      // Como o dpp é a data para 40 semanas, a janela de 38-42 seria dpp +/- 2 semanas.
      // O frontend filtra, mas aqui podemos apenas notificar que há pacientes ativas.
      
      const activePatientsSnapshot = await db.collection("patients")
        .where("status", "==", "Acompanhando")
        .get();

      if (activePatientsSnapshot.empty) {
        console.log("Nenhuma paciente ativa no momento.");
        return null;
      }

      // Enviar Push via FCM para o tópico 'admin'
      const payload = {
        notification: {
          title: "Resumo Semanal: Parteras Sin Fronteras",
          body: `Temos ${activePatientsSnapshot.size} gestantes ativas ("Acompanhando") nesta semana. Acesse o painel para verificar a janela de parto.`,
        }
      };

      await admin.messaging().sendToTopic("admin", payload);
      console.log("Weekly notification sent.");
      return null;
    } catch (error) {
      console.error("Error sending weekly notification:", error);
      return null;
    }
  });
