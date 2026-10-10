import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export default async function HomePage() {
  redirect((await cookies()).has('ledgerly_session') ? '/dashboard' : '/login');
}
