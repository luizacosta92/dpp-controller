"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Patient } from "@/types/patient";
import { ArrowLeft, Clock } from "lucide-react";
import Link from "next/link";

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);

  useEffect(() => {
    if (user) {
      const fetchHistory = async () => {
        const q = query(
          collection(db, "patients"),
          where("status", "==", "Finalizado")
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Patient[];
        
        // Ordena no frontend pelos mais recentes
        const sortedData = data.sort((a, b) => {
          const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
          const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
          return timeB - timeA;
        });

        setPatients(sortedData);
      };
      fetchHistory();
    }
  }, [user]);

  if (loading) return null;
  
  if (!user) {
    return <div className="p-8 text-center">Você precisa estar logado.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white px-6 pt-12 pb-6 shadow-sm sticky top-0 z-10 flex items-center gap-4">
        <Link href="/" className="p-2 -ml-2 text-gray-400 hover:text-rose-500 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Histórico</h1>
          <p className="text-sm text-gray-500">Acompanhamentos finalizados</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {patients.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="text-gray-400 w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Nenhum histórico</h3>
          </div>
        ) : (
          patients.map(patient => (
            <div key={patient.id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm opacity-70">
              <h2 className="text-lg font-semibold text-gray-800">{patient.name}</h2>
              <div className="text-sm text-gray-500 mt-1">
                Data do Parto / Finalização: {patient.updatedAt?.toDate ? patient.updatedAt.toDate().toLocaleDateString() : 'Desconhecida'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
