import type { User } from '@/types/entities';
import type { useNavigate } from '@tanstack/react-router';

interface UsersTableProps {
  data: User[];
  navigate: ReturnType<typeof useNavigate>;
  search: Record<string, unknown>;
}

/**
 * Stub: users table (full implementation can be added later)
 */
export function UsersTable({ data }: UsersTableProps) {
  if (data.length === 0) return null;
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((u) => (
            <tr key={u.id}>
              <td className="p-2">{u.name}</td>
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
