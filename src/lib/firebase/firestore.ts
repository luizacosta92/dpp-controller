import { collection, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "./config";
import { Patient } from "@/types/patient";

export const getActivePatients = (callback: (patients: Patient[]) => void) => {
  const q = query(
    collection(db, "patients"),
    where("status", "==", "Acompanhando")
  );

  return onSnapshot(q, (snapshot) => {
    const patients = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Patient[];
    
    // Filtro e Ordenação feitos no frontend por simplicidade, 
    // já que o DPP pode vir em diferentes formatos do Sheets.
    // O ideal seria que a Cloud Function parseasse o DPP para um Timestamp Firestore.
    
    callback(patients);
  });
};

export const markPatientAsFinished = async (patientId: string) => {
  const patientRef = doc(db, "patients", patientId);
  await updateDoc(patientRef, {
    status: "Finalizado",
    updatedAt: new Date()
  });
};
