import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { assetIntakeApi } from '@/services/api/asset-intake';
import type { PlatformDiscoveredAsset } from '@/types/entities';

export function AssetInboxPanel() {
  const queryClient = useQueryClient();
  const [claimStatus, setClaimStatus] = useState('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['asset-discovered', claimStatus],
    queryFn: () => assetIntakeApi.listDiscovered({ claimStatus, limit: 50 }),
  });

  const claimMutation = useMutation({
    mutationFn: (asset: PlatformDiscoveredAsset) =>
      assetIntakeApi.claimDiscovered(asset.id, {
        name: asset.rawName,
        platformFamily: asset.platformFamily,
        externalId: asset.externalId,
        environment: 'test',
        exposureLevel: 'internal',
        sensitiveData: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-discovered'] });
      queryClient.invalidateQueries({ queryKey: ['asset-agents'] });
      toast.success('待认领资产已入台账');
    },
  });

  const ignoreMutation = useMutation({
    mutationFn: assetIntakeApi.ignoreDiscovered,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-discovered'] });
      toast.success('已忽略发现资产');
    },
  });

  const rows = data?.data || [];

  return (
    <div className="space-y-4">
      <Tabs value={claimStatus} onValueChange={setClaimStatus}>
        <TabsList>
          <TabsTrigger value="pending">待认领</TabsTrigger>
          <TabsTrigger value="claimed">已认领</TabsTrigger>
          <TabsTrigger value="ignored">已忽略</TabsTrigger>
          <TabsTrigger value="all">全部</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">平台同步资产</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-muted-foreground" />
              <h3 className="font-medium">暂无待处理资产</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                真实平台同步接入后会在这里产生待认领记录。
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>原始名称</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>外部 ID</TableHead>
                  <TableHead>推测团队</TableHead>
                  <TableHead>发现时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.rawName}</TableCell>
                    <TableCell>{asset.platformFamily}</TableCell>
                    <TableCell>{asset.externalId}</TableCell>
                    <TableCell>{asset.guessTeam || '未识别'}</TableCell>
                    <TableCell>{new Date(asset.discoveredAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {asset.claimStatus === 'pending' && (
                          <>
                            <Button size="sm" onClick={() => claimMutation.mutate(asset)}>
                              认领入库
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => ignoreMutation.mutate(asset.id)}
                            >
                              忽略
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
