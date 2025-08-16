import AuthGuard from "@/components/auth-guard";

export const metadata = {
  title: "Judge Panel | Unified DJ",
};

export default function JudgePage() {
  return (
    <AuthGuard mode="email-only">
      <div className="flex min-h-svh flex-col items-center justify-center p-6">
        <div className="max-w-2xl w-full space-y-6 text-center">
          <h1 className="text-3xl font-bold">Welcome to the Judge Panel</h1>
          <p className="text-lg text-muted-foreground">
            You have access to review and score project submissions
          </p>
          <div className="grid gap-4 mt-8">
            <div className="p-6 bg-card rounded-lg border">
              <h2 className="text-xl font-semibold mb-2">Review Submissions</h2>
              <p className="text-muted-foreground">
                Access all project submissions and provide detailed feedback
              </p>
            </div>
            <div className="p-6 bg-card rounded-lg border">
              <h2 className="text-xl font-semibold mb-2">Scoring System</h2>
              <p className="text-muted-foreground">
                Rate projects on technology, UI/UX, adoption, and originality
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
