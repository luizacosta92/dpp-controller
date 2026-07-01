export interface Patient {
  id: string;
  name: string;
  age: number | string;
  spouse: string;
  location: string;
  dpp: string; // Data Provável de Parto (ISO ou formato da planilha)
  status: 'Acompanhando' | 'Finalizado';
  createdAt?: any;
  updatedAt?: any;
}
