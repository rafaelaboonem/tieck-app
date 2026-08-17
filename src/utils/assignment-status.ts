export type AssignmentStatus = 'sem_prazo' | 'pendente' | 'concluido' | 'atrasado';

export function getAssignmentStatus(dueAt: string | null, completedAt: string | null): AssignmentStatus {
  if (completedAt) return 'concluido';
  if (!dueAt) return 'sem_prazo';
  
  const now = new Date();
  const deadline = new Date(dueAt);
  
  if (now > deadline) return 'atrasado';
  return 'pendente';
}

export function getStatusBadge(status: AssignmentStatus) {
  switch (status) {
    case 'concluido':
      return { label: 'Concluído', className: 'bg-green-100 text-green-700 border-green-200' };
    case 'atrasado':
      return { label: 'Atrasado', className: 'bg-red-100 text-red-700 border-red-200' };
    case 'pendente':
      return { label: 'Pendente', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    default:
      return null;
  }
}
