export type DnvStatus = 'Solicitar' | 'Solicitada' | 'Retirar' | 'Retirada' | 'Entregue à família' | 'Cópia entregue à SMS' | 'Hospitalar';

export interface Patient {
  id: string;
  // Fields from Google Sheets
  timestamp?: string;
  email?: string;
  name: string;
  babyName?: string;
  dum?: string;
  dpp: string; // Data Provável de Parto
  bloodType?: string;
  phone?: string;
  rg?: string;
  cpf?: string;
  birthDate?: string;
  age: number | string;
  birthPlace?: string;
  profession?: string;
  education?: string;
  maritalStatus?: string;
  location: string; // Endereço principal
  zipcode?: string;
  cityState?: string;
  spouse: string;
  spouseEmail?: string;
  spouseRg?: string;
  spouseCpf?: string;
  spouseBirthDate?: string;
  spouseAge?: number | string;
  spouseBirthPlace?: string;
  spouseProfession?: string;
  spouseEducation?: string;
  spouseMaritalStatus?: string;
  spouseAddress?: string;
  spouseZipcode?: string;
  spouseCityState?: string;
  howDidYouKnow?: string;
  birthLocation?: string;
  status: 'Acompanhando' | 'Finalizado';
  
  // App-exclusive fields (not overwritten by webhook)
  dnvStatus?: DnvStatus;
  last_edited_by?: string;
  last_edited_at?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}
