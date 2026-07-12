"use client";

import { useAuth } from "@/contexts/AuthContext";
import { signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { useState, useEffect } from "react";
import { getActivePatients, markPatientAsFinished, checkUserAuthorization } from "@/lib/firebase/firestore";
import { Patient } from "@/types/patient";
import { parse, differenceInWeeks, isValid } from "date-fns";
import { CalendarHeart, MapPin, User as UserIcon, Activity, CheckCircle, LogOut, ChevronDown, ChevronUp, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const dnvColors: Record<string, string> = {
  'Solicitar': 'bg-gradient-to-r from-rose-100 to-rose-200 text-rose-800 border-rose-300',
  'Solicitada': 'bg-gradient-to-r from-orange-100 to-orange-200 text-orange-800 border-orange-300',
  'Retirar': 'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border-yellow-300',
  'Retirada': 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300',
  'Entregue à família': 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-300',
  'Cópia entregue à SMS': 'bg-gradient-to-r from-teal-100 to-teal-200 text-teal-800 border-teal-300',
  'Hospitalar': 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border-gray-300',
};

export default function Home() {
  const { user, loading } = useAuth();
  const [error, setError] = useState("");
  const router = useRouter();

  // Dashboard state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const [showNextBirths, setShowNextBirths] = useState(false);

  useEffect(() => {
    let unsubscribe: () => void;
    
    const checkAuthAndSubscribe = async () => {
      if (user && user.email) {
        setIsCheckingAuth(true);
        const isAuth = await checkUserAuthorization(user.email);
        setIsCheckingAuth(false);
        
        if (!isAuth) {
          setError("Acesso não autorizado. Seu e-mail não está na whitelist.");
          await signOut(auth);
          return;
        }

        unsubscribe = getActivePatients((data) => {
          setPatients(data);
        });
      }
    };

    checkAuthAndSubscribe();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  const handleGoogleLogin = async () => {
    try {
      setError("");
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError("Erro ao fazer login com o Google.");
      console.error(err);
    }
  };

  const handleFinish = async (e: React.MouseEvent, patient: Patient) => {
    e.stopPropagation(); // prevent card click
    
    const dnv = patient.dnvStatus || 'Solicitar';
    if (dnv !== 'Hospitalar' && dnv !== 'Cópia entregue à SMS') {
      alert("O acompanhamento só pode ser finalizado se a DNV for 'Hospitalar' ou 'Cópia entregue à SMS'.");
      return;
    }

    if (confirm("Tem certeza que deseja finalizar o acompanhamento desta paciente?")) {
      await markPatientAsFinished(patient.id, user?.email || 'unknown');
    }
  };

  // Helper function to calculate weeks and parse date
  const getGestationInfo = (dppString: string) => {
    try {
      if (!dppString) return { weeks: 0, isDeliveryWindow: false, parsedDate: null };

      let dppDate = parse(dppString, "dd/MM/yyyy", new Date());
      if (!isValid(dppDate)) {
        dppDate = parse(dppString, "MM/dd/yyyy", new Date());
      }
      if (!isValid(dppDate)) {
        // Fallback for ISO strings or other formats
        dppDate = new Date(dppString);
      }
      
      if (!isValid(dppDate)) return { weeks: 0, isDeliveryWindow: false, parsedDate: null };
      
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
      return { weeks: 0, isDeliveryWindow: false, parsedDate: null };
    }
  };

  if (loading || isCheckingAuth) {
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
          
          <div className="space-y-6">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center border border-red-100">{error}</div>}
            <button 
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-xl shadow-sm transition-all active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Entrar com o Google
            </button>
          </div>
        </div>
      </div>
    );
  }

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

  const otherPatients = processedPatients
    .filter(p => !p.isDeliveryWindow)
    .sort((a, b) => {
      if (a.parsedDate && b.parsedDate) return a.parsedDate.getTime() - b.parsedDate.getTime();
      return 0;
    });

  const renderPatientCard = (patient: Patient & { weeks: number }, isDeliveryWindow: boolean) => {
    const dnv = patient.dnvStatus || 'Solicitar';
    const canFinish = dnv === 'Hospitalar' || dnv === 'Cópia entregue à SMS';
    
    return (
      <div 
        key={patient.id} 
        onClick={() => router.push(`/paciente?id=${patient.id}`)}
        className={`rounded-2xl p-5 shadow-sm border relative overflow-hidden transition-all hover:shadow-md cursor-pointer ${isDeliveryWindow ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-200'}`}
      >
        <div className={`absolute top-0 left-0 w-1 h-full ${isDeliveryWindow ? 'bg-rose-400' : 'bg-gray-300'}`}></div>
        
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 pr-3">
            <h2 className="text-xl font-semibold text-gray-800">{patient.name}</h2>
            <div className="flex flex-wrap items-center text-sm text-gray-500 mt-1 gap-x-4 gap-y-1">
              <span className="flex items-center gap-1"><UserIcon className="w-4 h-4"/> {patient.age} anos</span>
              {patient.spouse && <span className="text-gray-400">Cônjuge: {patient.spouse}</span>}
              {patient.babyName && <span className="text-gray-400">Bebê: {patient.babyName}</span>}
            </div>
          </div>
          <div className={`${isDeliveryWindow ? 'bg-rose-50 text-rose-600' : 'bg-green-50 text-green-600'} px-3 py-1 rounded-full text-sm font-bold shadow-sm whitespace-nowrap`}>
            {patient.weeks} sem
          </div>
        </div>

        <div className="flex flex-col gap-2 mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarHeart className="w-4 h-4 text-gray-400" />
            <span>DPP: <strong className="text-gray-800">{patient.dpp}</strong></span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm text-gray-600">
            <div className="flex items-center gap-2 truncate">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="truncate">{patient.location}</span>
            </div>
            
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap ${dnvColors[dnv] || dnvColors['Solicitar']}`}>
              <FileText className="w-3 h-3" />
              {dnv}
            </div>
          </div>
        </div>

        <button 
          onClick={(e) => handleFinish(e, patient)}
          disabled={!canFinish}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-colors font-medium border
            ${canFinish 
              ? 'bg-gray-50 hover:bg-green-50 text-gray-600 hover:text-green-600 border-gray-200' 
              : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed opacity-70'
            }`}
        >
          <CheckCircle className="w-5 h-5" />
          Finalizar Acompanhamento
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-6 shadow-sm sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Painel de Partos</h1>
          <p className="text-sm text-gray-500">Acompanhamentos Ativos</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/history" className="text-gray-400 hover:text-gray-800 transition-colors text-sm font-medium hidden sm:block">
            Histórico
          </Link>
          <button onClick={() => signOut(auth)} className="p-2 text-gray-400 hover:text-rose-500 transition-colors">
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4 px-2">Janela de Parto (38 a 42 sem)</h3>
        
        {deliveryWindowPatients.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <div className="bg-rose-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="text-rose-400 w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Nenhuma gestante na janela</h3>
            <p className="text-gray-500 mt-1 text-sm">O painel principal mostrará pacientes entre 38 e 42 semanas.</p>
          </div>
        ) : (
          deliveryWindowPatients.map(patient => renderPatientCard(patient, true))
        )}

        {/* Accordion para Próximos Partos */}
        {otherPatients.length > 0 && (
          <div className="mt-8">
            <button 
              onClick={() => setShowNextBirths(!showNextBirths)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span>Próximos Partos ({otherPatients.length})</span>
              </div>
              {showNextBirths ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            
            {showNextBirths && (
              <div className="mt-4 space-y-4">
                {otherPatients.map(patient => renderPatientCard(patient, false))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
