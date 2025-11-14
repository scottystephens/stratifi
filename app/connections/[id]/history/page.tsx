'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';

interface Job {
  id: string;
  status: string;
  job_type: string;
  records_fetched: number;
  records_processed: number;
  records_imported: number;
  records_skipped: number;
  records_failed: number;
  error_message: string | null;
  summary: any;
  created_at: string;
  completed_at: string | null;
}

export default function ConnectionHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const { currentTenant } = useTenant();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const connectionId = params.id as string;

  useEffect(() => {
    if (currentTenant && connectionId) {
      loadJobs();
    }
  }, [currentTenant, connectionId]);

  async function loadJobs() {
    if (!currentTenant) return;

    try {
      setLoading(true);
      const response = await fetch(
        `/api/connections/jobs?tenantId=${currentTenant.id}&connectionId=${connectionId}`
      );
      const data = await response.json();

      if (data.success) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'running':
        return <Clock className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'partial':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  if (!currentTenant) {
    return (
      <div className="p-8">
        <p>Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <main className="flex-1 overflow-y-auto bg-background p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() => router.push('/connections')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Connections
            </Button>
            <h1 className="text-3xl font-bold">Import History</h1>
            <p className="text-muted-foreground mt-2">
              View all import jobs for this connection
            </p>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <p>Loading history...</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && jobs.length === 0 && (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No import history found</p>
            </Card>
          )}

          {/* Jobs List */}
          {!loading && jobs.length > 0 && (
            <div className="space-y-4">
              {jobs.map((job) => (
                <Card key={job.id} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(job.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">Import Job</h3>
                          <Badge className={getStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(job.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-5 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{job.records_fetched}</div>
                      <div className="text-xs text-muted-foreground">Fetched</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{job.records_processed}</div>
                      <div className="text-xs text-muted-foreground">Processed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {job.records_imported}
                      </div>
                      <div className="text-xs text-muted-foreground">Imported</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {job.records_skipped}
                      </div>
                      <div className="text-xs text-muted-foreground">Skipped</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {job.records_failed}
                      </div>
                      <div className="text-xs text-muted-foreground">Failed</div>
                    </div>
                  </div>

                  {/* Error Message */}
                  {job.error_message && (
                    <div className="border border-red-200 rounded p-3 bg-red-50 text-sm text-red-800">
                      <strong>Error:</strong> {job.error_message}
                    </div>
                  )}

                  {/* Duration */}
                  {job.completed_at && (
                    <div className="text-sm text-muted-foreground mt-2">
                      Completed in{' '}
                      {Math.round(
                        (new Date(job.completed_at).getTime() -
                          new Date(job.created_at).getTime()) /
                          1000
                      )}
                      s
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

