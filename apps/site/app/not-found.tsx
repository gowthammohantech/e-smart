import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="container-site grid min-h-screen place-items-center text-center">
      <div>
        <p className="text-sm text-primary">404</p>
        <h1 className="h-section mt-3">This page isn&apos;t in the books.</h1>
        <Button href="/" className="mt-8">
          Back to home
        </Button>
      </div>
    </main>
  );
}
