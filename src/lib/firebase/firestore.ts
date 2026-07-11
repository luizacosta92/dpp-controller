import { collection, query, where, getDocs, doc, updateDoc, onSnapshot, getDoc, setDoc } from "firebase/firestore";
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
    
    callback(patients);
  });
};

export const getPatientById = async (patientId: string): Promise<Patient | null> => {
  const docRef = doc(db, "patients", patientId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as Patient;
  }
  return null;
};

export const checkUserAuthorization = async (email: string): Promise<boolean> => {
  if (!email) return false;
  const docRef = doc(db, "authorized_users", email);
  const docSnap = await getDoc(docRef);
  return docSnap.exists();
};

export const updatePatientWithAudit = async (patientId: string, updates: Partial<Patient>, userEmail: string) => {
  const patientRef = doc(db, "patients", patientId);
  await updateDoc(patientRef, {
    ...updates,
    last_edited_by: userEmail,
    last_edited_at: new Date(),
    updatedAt: new Date()
  });
};

export const markPatientAsFinished = async (patientId: string, userEmail: string) => {
  const patientRef = doc(db, "patients", patientId);
  await updateDoc(patientRef, {
    status: "Finalizado",
    last_edited_by: userEmail,
    last_edited_at: new Date(),
    updatedAt: new Date()
  });
};
