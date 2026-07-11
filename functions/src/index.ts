import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// 1. Webhook para Sincronizar com Google Sheets
export const syncPatientData = functions.https.onRequest(async (req, res) => {
  try {
    // Validação básica de segurança (opcional, pode ser melhorada com tokens)
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const data = req.body;
    if (!data || !data.id || !data.name) {
      res.status(400).send('Bad Request: Missing required fields');
      return;
    }

    const { id, status, ...rest } = data;
    let dpp = data.dpp;
    const patientRef = db.collection("patients").doc(String(id));

    const doc = await patientRef.get();
    
    // Normalize Status (remove spaces, ignore case)
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const patientStatus = normalizedStatus === 'finalizado' ? 'Finalizado' : 'Acompanhando';

    // Normalize Date (convert ISO to dd/MM/yyyy if necessary)
    if (dpp && typeof dpp === 'string' && dpp.includes('T')) {
      try {
        const d = new Date(dpp);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        dpp = `${day}/${month}/${year}`;
      } catch (e) {
        // keep original if parsing fails
      }
    }

    // Shield local fields (ensure webhook never overwrites them)
    delete rest.dnvStatus;
    delete rest.last_edited_by;
    delete rest.last_edited_at;

    const payload = {
      ...rest,
      dpp,
      status: patientStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (!doc.exists) {
      payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
      // Only set initial DNV status for new patients
      payload.dnvStatus = 'Solicitar';
    }

    // Upsert na coleção patients using merge: true to avoid overwriting existing shielded fields
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
