"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, Suspense } from "react";
import { getPatientById, updatePatientWithAudit, markPatientAsFinished, checkUserAuthorization } from "@/lib/firebase/firestore";
import { Patient, DnvStatus } from "@/types/patient";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save, FileText, CheckCircle } from "lucide-react";
import Link from "next/link";

const DNV_OPTIONS: DnvStatus[] = [
  'Solicitar', 'Solicitada', 'Retirar', 'Retirada', 
  'Entregue à família', 'Cópia entregue à SMS', 'Hospitalar'
];

const SHEETS_FIELDS = [
  { key: 'email', label: 'Email Address' },
  { key: 'name', label: 'Nome da gestante' },
  { key: 'babyName', label: 'Nome do bebê' },
  { key: 'dum', label: 'DUM (data da ultima menstruação)' },
  { key: 'dpp', label: 'DPP (Data provável do parto)' },
  { key: 'bloodType', label: 'Tipo sanguíneo' },
  { key: 'phone', label: 'Telefone para contato' },
  { key: 'rg', label: 'RG' },
  { key: 'cpf', label: 'CPF ou Passaporte' },
  { key: 'birthDate', label: 'Data de nascimento' },
  { key: 'age', label: 'Idade' },
  { key: 'birthPlace', label: 'Naturalidade' },
  { key: 'profession', label: 'Profissão' },
  { key: 'education', label: 'Escolaridade' },
  { key: 'maritalStatus', label: 'Estado civil' },
  { key: 'location', label: 'Endereço (rua, número, bairro)' },
  { key: 'zipcode', label: 'CEP' },
  { key: 'cityState', label: 'Cidade/Estado' },
  { key: 'spouse', label: 'Nome do companheiro (a)' },
  { key: 'spouseEmail', label: 'Email do acompanhante' },
  { key: 'spouseRg', label: 'RG (Acompanhante)' },
  { key: 'spouseCpf', label: 'CPF ou passaporte (Acompanhante)' },
  { key: 'spouseBirthDate', label: 'Data de nascimento (Acompanhante)' },
  { key: 'spouseAge', label: 'Idade (Acompanhante)' },
  { key: 'spouseBirthPlace', label: 'Naturalidade (Acompanhante)' },
  { key: 'spouseProfession', label: 'Profissão (Acompanhante)' },
  { key: 'spouseEducation', label: 'Escolaridade (Acompanhante)' },
  { key: 'spouseMaritalStatus', label: 'Estado Civil (Acompanhante)' },
  { key: 'spouseAddress', label: 'Endereço (se for diferente da gestante)' },
  { key: 'spouseZipcode', label: 'CEP (se for diferente da gestante)' },
  { key: 'spouseCityState', label: 'Cidade/Estado (se for diferente da gestante)' },
  { key: 'howDidYouKnow', label: 'Como conheceu a equipe?' },
  { key: 'birthLocation', label: 'Local do Parto' },
  { key: 'status', label: 'Status' }
];

function PatientDetailsContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { user, loading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [formData, setFormData] = useState<Partial<Patient>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const fetchPatientAndCheckAuth = async () => {
      if (!id) {
        router.push("/");
        return;
      }
      if (user && user.email) {
        const isAuth = await checkUserAuthorization(user.email);
        setIsCheckingAuth(false);
        if (!isAuth) {
          router.push("/");
          return;
        }

        const data = await getPatientById(id);
        if (data) {
          setPatient(data);
          setFormData(data);
        } else {
          router.push("/");
        }
      } else if (!loading && !user) {
        router.push("/");
      }
    };
    fetchPatientAndCheckAuth();
  }, [id, user, loading, router]);

  const handleInputChange = (key: keyof Patient, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!user?.email || !patient) return;
    setIsSaving(true);
    try {
      // 1. Save to Firestore
      await updatePatientWithAudit(patient.id, formData, user.email);
      
      // 2. Webhook to Sheets (Mock for now, needs real URL later)
      const webhookUrl = process.env.NEXT_PUBLIC_SHEETS_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
        } catch (err) {
          console.error("Failed to sync with sheets", err);
        }
      }

      setPatient({ ...patient, ...formData } as Patient);
      setHasChanges(false);
      alert("Alterações salvas com sucesso!");
    } catch (err) {
      console.error("Error saving patient", err);
      alert("Erro ao salvar alterações.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinish = async () => {
    const dnv = formData.dnvStatus || patient?.dnvStatus || 'Solicitar';
    if (dnv !== 'Hospitalar' && dnv !== 'Cópia entregue à SMS') {
      alert("O acompanhamento só pode ser finalizado se a DNV for 'Hospitalar' ou 'Cópia entregue à SMS'.");
      return;
    }

    if (confirm("Tem certeza que deseja finalizar o acompanhamento desta paciente?")) {
      if (user?.email && patient) {
        await markPatientAsFinished(patient.id, user.email);
        setPatient({ ...patient, status: 'Finalizado' });
        setFormData(prev => ({ ...prev, status: 'Finalizado' }));
      }
    }
  };

  if (loading || isCheckingAuth || !patient) {
    return <div className="flex h-screen items-center justify-center bg-rose-50"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div></div>;
  }

  const currentDnv = formData.dnvStatus || 'Solicitar';
  const canFinish = currentDnv === 'Hospitalar' || currentDnv === 'Cópia entregue à SMS';

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-6 shadow-sm sticky top-0 z-20 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 -ml-2 text-gray-400 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{patient.name}</h1>
            <p className="text-sm text-gray-500">Detalhes da Paciente</p>
          </div>
        </div>
        <div>
          <button 
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all shadow-sm
              ${hasChanges 
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200' 
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
          >
            <Save className="w-5 h-5" />
            <span className="hidden sm:inline">{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8 flex flex-col lg:flex-row gap-6">
        
        {/* Formulário Principal (Ordem do Sheets) */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-800">Dados da Gestante e Acompanhante</h2>
            <p className="text-sm text-gray-500">Os campos vazios podem ser preenchidos.</p>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {SHEETS_FIELDS.map((field) => (
              <div key={field.key} className={`${['address', 'spouseAddress', 'location'].includes(field.key) ? 'md:col-span-2' : ''}`}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {field.label}
                </label>
                <input
                  type="text"
                  value={(formData[field.key as keyof Patient] as string) || ''}
                  onChange={(e) => handleInputChange(field.key as keyof Patient, e.target.value)}
                  placeholder={patient[field.key as keyof Patient] ? '' : 'Preencher...'}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Coluna Lateral: DNV e Ações */}
        <div className="w-full lg:w-80 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden sticky top-32">
            <div className="p-5 border-b border-gray-100 bg-teal-50/30">
              <div className="flex items-center gap-2 text-teal-800 font-semibold mb-1">
                <FileText className="w-5 h-5" />
                <span>Declaração de Nascido Vivo</span>
              </div>
              <p className="text-xs text-teal-600/80">Controle do documento físico</p>
            </div>
            <div className="p-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Status da DNV</label>
              <select
                value={currentDnv}
                onChange={(e) => handleInputChange('dnvStatus', e.target.value)}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-800 font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all outline-none shadow-sm cursor-pointer"
              >
                {DNV_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

              <hr className="my-6 border-gray-100" />

              <button 
                onClick={handleFinish}
                disabled={!canFinish || patient.status === 'Finalizado'}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-colors font-medium border
                  ${patient.status === 'Finalizado'
                    ? 'bg-green-100 text-green-700 border-green-200 cursor-not-allowed'
                    : canFinish 
                      ? 'bg-gray-50 hover:bg-green-50 text-gray-600 hover:text-green-600 border-gray-200 shadow-sm' 
                      : 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed'
                  }`}
              >
                <CheckCircle className="w-5 h-5" />
                {patient.status === 'Finalizado' ? 'Acompanhamento Finalizado' : 'Finalizar Acompanhamento'}
              </button>
              
              {!canFinish && patient.status !== 'Finalizado' && (
                <p className="text-xs text-center text-gray-400 mt-3">
                  Requer DNV como &quot;Hospitalar&quot; ou &quot;Cópia entregue à SMS&quot;
                </p>
              )}
            </div>
            
            {(patient.last_edited_by || formData.last_edited_by) && (
              <div className="bg-gray-50 p-4 border-t border-gray-100 text-xs text-gray-500">
                <p>Última edição por:</p>
                <p className="font-medium truncate">{formData.last_edited_by || patient.last_edited_by}</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default function PatientDetails() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-rose-50"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div></div>}>
      <PatientDetailsContent />
    </Suspense>
  );
}
