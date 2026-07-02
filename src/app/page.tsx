"use client";

import { useAuth } from "@/contexts/AuthContext";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { useState, useEffect } from "react";
import { getActivePatients, markPatientAsFinished } from "@/lib/firebase/firestore";
import { Patient } from "@/types/patient";
import { parse, differenceInWeeks, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarHeart, MapPin, User as UserIcon, Activity, CheckCircle, LogOut } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const { user, loading } = useAuth();
  
  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Dashboard state
  const [patients, setPatients] = useState<Patient[]>([]);

  useEffect(() => {
    if (user) {
      const unsubscribe = getActivePatients((data) => {
        setPatients(data);
      });
      return () => unsubscribe();
    }
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError("Credenciais inválidas.");
    }
  };

  const handleFinish = async (id: string) => {
    if (confirm("Tem certeza que deseja finalizar o acompanhamento desta paciente?")) {
      await markPatientAsFinished(id);
    }
  };

  // Helper function to calculate weeks and parse date
  const getGestationInfo = (dppString: string) => {
    try {
      // Assuming DPP comes in DD/MM/YYYY format from Sheets
      const dppDate = parse(dppString, "dd/MM/yyyy", new Date());
      if (!isValid(dppDate)) return { weeks: 0, isDeliveryWindow: false };
      
      const today = new Date();
      // If DPP is 40 weeks, weeks remaining to DPP:
      const weeksToDpp = differenceInWeeks(dppDate, today);
      const currentWeeks = 40 - weeksToDpp;
      
      return {
        weeks: currentWeeks,
        isDeliveryWindow: currentWeeks >= 38 && currentWeeks <= 42,
        parsedDate: dppDate
      };
    } catch {
      return { weeks: 0, isDeliveryWindow: false };
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-rose-50"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div></div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-100 to-teal-50 px-4">
        <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/50">
          <div className="flex justify-center mb-6">
            <div className="bg-rose-500 p-4 rounded-full shadow-lg shadow-rose-200">
              <CalendarHeart className="text-white w-8 h-8" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">Parteras PWA</h1>
          <p className="text-center text-gray-500 mb-8">Acesso restrito para equipe</p>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none transition-all"
                placeholder="secretaria@parteras.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button 
              type="submit" 
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-xl shadow-lg shadow-rose-200 transition-all active:scale-[0.98]"
            >
              Entrar no Sistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard View
  
  // Filter and sort patients
  const processedPatients = patients.map(p => ({
    ...p,
    ...getGestationInfo(p.dpp)
  }));
  
  const deliveryWindowPatients = processedPatients
    .filter(p => p.isDeliveryWindow)
    .sort((a, b) => {
      if (a.parsedDate && b.parsedDate) return a.parsedDate.getTime() - b.parsedDate.getTime();
      return 0;
    });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-6 shadow-sm sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Painel de Partos</h1>
          <p className="text-sm text-gray-500">Janela de 38 a 42 semanas</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/history" className="text-gray-400 hover:text-gray-800 transition-colors text-sm font-medium">
            Histórico
          </Link>
          <Link href="/settings" className="text-gray-400 hover:text-gray-800 transition-colors text-sm font-medium">
            Configurações
          </Link>
          <button onClick={() => signOut(auth)} className="p-2 text-gray-400 hover:text-rose-500 transition-colors">
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {deliveryWindowPatients.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="text-gray-400 w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Nenhuma gestante na janela</h3>
            <p className="text-gray-500 mt-1">O painel mostrará pacientes entre 38 e 42 semanas.</p>
          </div>
        ) : (
          deliveryWindowPatients.map(patient => (
            <div key={patient.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative overflow-hidden transition-all hover:shadow-md">
              <div className="absolute top-0 left-0 w-1 h-full bg-rose-400"></div>
              
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">{patient.name}</h2>
                  <div className="flex items-center text-sm text-gray-500 mt-1 gap-4">
                    <span className="flex items-center gap-1"><UserIcon className="w-4 h-4"/> {patient.age} anos</span>
                    {patient.spouse && <span className="text-gray-400">Cônjuge: {patient.spouse}</span>}
                  </div>
                </div>
                <div className="bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                  {patient.weeks} sem
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <CalendarHeart className="w-4 h-4 text-gray-400" />
                  <span>DPP: <strong className="text-gray-800">{patient.dpp}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span>{patient.location}</span>
                </div>
              </div>

              <button 
                onClick={() => handleFinish(patient.id)}
                className="w-full flex items-center justify-center gap-2 bg-gray-50 hover:bg-green-50 text-gray-600 hover:text-green-600 border border-gray-200 py-3 rounded-xl transition-colors font-medium"
              >
                <CheckCircle className="w-5 h-5" />
                Finalizar Acompanhamento
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
