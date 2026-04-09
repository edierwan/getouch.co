import { db } from '@/lib/db';
import { users, appProvisions } from '@/lib/schema';
import { getSession } from '@/lib/auth';
import { desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { updateUserRole, provisionToOpenWebUI, deleteUser } from './actions';

export default async function UsersPage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/admin');

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      emailVerified: users.emailVerified,
      phoneVerified: users.phoneVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  // Get provisioned user IDs for Open WebUI
  const provisions = await db
    .select({ userId: appProvisions.userId })
    .from(appProvisions)
    .where(eq(appProvisions.app, 'open_webui'));
  const provisionedIds = new Set(provisions.map((p) => p.userId));

  return (
    <div className="portal-body">
      <div className="portal-page-header">
        <div>
          <h2 className="portal-page-title">Users</h2>
          <p className="portal-page-sub">Manage platform users, roles, and downstream provisioning.</p>
        </div>
        <a href="/admin" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>← Back to Dashboard</a>
      </div>

        <section className="portal-section" style={{ marginBottom: 0 }}>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Verified</th>
                  <th>AI Access</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="user-name">{user.name}</td>
                    <td className="user-email">{user.email}</td>
                    <td className="user-email">{user.phone ?? '—'}</td>
                    <td>
                      <span className={`role-badge role-${user.role}`}>
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {user.emailVerified && (
                          <span className="prov-badge prov-yes">Email</span>
                        )}
                        {user.phoneVerified && (
                          <span className="prov-badge prov-yes">WA</span>
                        )}
                        {!user.emailVerified && !user.phoneVerified && (
                          <span className="prov-badge prov-pending">No</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {provisionedIds.has(user.id) ? (
                        <span className="prov-badge prov-yes">Provisioned</span>
                      ) : (
                        <span className="prov-badge prov-no">—</span>
                      )}
                    </td>
                    <td className="user-date">
                      {new Date(user.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="user-actions">
                      {user.role === 'pending' && (
                        <form action={updateUserRole}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="role" value="user" />
                          <button type="submit" className="action-btn action-approve">
                            Approve
                          </button>
                        </form>
                      )}
                      {user.role === 'user' && (
                        <form action={updateUserRole}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="role" value="admin" />
                          <button type="submit" className="action-btn action-promote">
                            Make Admin
                          </button>
                        </form>
                      )}
                      {user.role === 'admin' && user.id !== session.userId && (
                        <form action={updateUserRole}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="role" value="user" />
                          <button type="submit" className="action-btn action-demote">
                            Demote
                          </button>
                        </form>
                      )}
                      {user.role === 'admin' && user.id === session.userId && (
                        <span className="action-you">You</span>
                      )}
                      {!provisionedIds.has(user.id) && user.role !== 'pending' && (
                        <form action={provisionToOpenWebUI}>
                          <input type="hidden" name="userId" value={user.id} />
                          <button type="submit" className="action-btn action-provision">
                            → AI
                          </button>
                        </form>
                      )}
                      {user.id !== session.userId && (
                        <form action={deleteUser}>
                          <input type="hidden" name="userId" value={user.id} />
                          <button type="submit" className="action-btn action-delete">
                            Delete
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
    </div>
  );
}
