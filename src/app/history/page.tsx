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
          where("status", "in", ["Finalizado", "Excluído"])
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Patient[];
        
        // Ordena no frontend pelos mais recentes
        const sortedData = data.sort((a, b) => {
          const timeA = (a.deleted_at as any)?.toMillis ? (a.deleted_at as any).toMillis() : (a.updatedAt as any)?.toMillis ? (a.updatedAt as any).toMillis() : 0;
          const timeB = (b.deleted_at as any)?.toMillis ? (b.deleted_at as any).toMillis() : (b.updatedAt as any)?.toMillis ? (b.updatedAt as any).toMillis() : 0;
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
          <p className="text-sm text-gray-500">Acompanhamentos finalizados e excluídos</p>
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
          patients.map(patient => {
            const isExcluido = patient.status === 'Excluído';
            const actionDate = isExcluido 
              ? ((patient.deleted_at as any)?.toDate?.() || (patient.updatedAt as any)?.toDate?.())
              : (patient.updatedAt as any)?.toDate?.();

            const dateString = actionDate ? actionDate.toLocaleDateString('pt-BR') : 'Desconhecida';

            return (
              <div key={patient.id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm opacity-80 hover:opacity-100 transition-opacity">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-gray-800">{patient.name}</h2>
                    <div className="text-sm mt-1">
                      {isExcluido ? (
                        <span className="text-rose-600 font-medium">
                          Acompanhamento excluído em: {dateString}
                        </span>
                      ) : (
                        <span className="text-gray-500">
                          Data do Parto / Finalização: {dateString}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      isExcluido 
                        ? 'bg-rose-50 text-rose-700 border-rose-200' 
                        : 'bg-gray-100 text-gray-700 border-gray-200'
                    }`}>
                      {isExcluido ? 'Excluído' : 'Finalizado'}
                    </span>
                    {patient.birthLocation && (
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        patient.birthLocation.trim().toLowerCase().includes('domiciliar')
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {patient.birthLocation}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
