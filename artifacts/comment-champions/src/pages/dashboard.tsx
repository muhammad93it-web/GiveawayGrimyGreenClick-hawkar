import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input } from '@/components/ui/shared';
import { Avatar } from '@/components/Avatar';
import { Play, Pause, RefreshCw, Trophy, ExternalLink, Settings, Facebook, Instagram, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import {
  useGetMetaStatus,
  getGetMetaStatusQueryKey,
  useListMetaAssets,
  getListMetaAssetsQueryKey,
  useListMetaAssetPosts,
  getListMetaAssetPostsQueryKey,
  useGetCurrentGiveaway,
  getGetCurrentGiveawayQueryKey,
  usePutCurrentGiveaway,
  usePatchGiveawayStatus,
  useSyncGiveaway,
  useMetaDisconnect,
  GiveawayProjection
} from '@workspace/api-client-react';

export default function Dashboard() {
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const metaState = searchParams.get('meta');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (metaState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [metaState]);

  const authReq = useMemo(() => ({ credentials: 'include' as const }), []);

  const { data: metaStatus, isLoading: isMetaLoading } = useGetMetaStatus({ request: authReq });

  const mutationReq = useMemo(() => ({
    credentials: 'include' as const,
    headers: metaStatus?.csrfToken ? { 'X-CSRF-Token': metaStatus.csrfToken } : undefined
  }), [metaStatus?.csrfToken]);

  const { data: giveaway } = useGetCurrentGiveaway({
    request: authReq,
    query: {
      queryKey: getGetCurrentGiveawayQueryKey(),
      refetchInterval: (query) => (query.state.data?.status === 'running' ? 5000 : false) as any,
    }
  });

  const updateGiveawayCache = (updated: GiveawayProjection) => {
    queryClient.setQueryData(getGetCurrentGiveawayQueryKey(), updated);
  };

  const putGiveaway = usePutCurrentGiveaway({
    request: mutationReq,
    mutation: { onSuccess: updateGiveawayCache },
  });
  const patchStatus = usePatchGiveawayStatus({
    request: mutationReq,
    mutation: { onSuccess: updateGiveawayCache },
  });
  const syncGiveaway = useSyncGiveaway({
    request: mutationReq,
    mutation: { onSuccess: updateGiveawayCache },
  });
  const disconnectMeta = useMetaDisconnect({ request: mutationReq });

  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [selectedPostId, setSelectedPostId] = useState<string>('');
  const [prizeCount, setPrizeCount] = useState<number>(3);
  const [prizeTitle, setPrizeTitle] = useState<string>('');

  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (giveaway && giveaway.exists) {
      if (initializedForId.current !== giveaway.postId) {
        if (giveaway.postId) setSelectedPostId(giveaway.postId);
        if (giveaway.prizeCount) setPrizeCount(giveaway.prizeCount);
        if (giveaway.prizeTitle) setPrizeTitle(giveaway.prizeTitle);
        // We can't automatically know assetId from projection unless we fetch it,
        // but typically user doesn't need to change assetId once running.
        initializedForId.current = giveaway.postId || null;
      }
    }
  }, [giveaway]);

  const { data: assets, error: assetsError } = useListMetaAssets({
    request: authReq,
    query: {
      queryKey: getListMetaAssetsQueryKey(),
      enabled: !!metaStatus?.connected
    }
  });

  const { data: posts, error: postsError } = useListMetaAssetPosts(selectedAssetId, {
    request: authReq,
    query: {
      queryKey: getListMetaAssetPostsQueryKey(selectedAssetId),
      enabled: !!selectedAssetId && !!metaStatus?.connected
    }
  });

  const handleSaveGiveaway = () => {
    if (!metaStatus?.csrfToken || !selectedAssetId || !selectedPostId || !prizeCount || !prizeTitle) return;
    putGiveaway.mutate({
      data: {
        assetId: selectedAssetId,
        postId: selectedPostId,
        prizeCount,
        prizeTitle
      }
    }, {
      onSuccess: () => {
        syncGiveaway.mutate();
      }
    });
  };

  const handleStart = () => patchStatus.mutate({ data: { status: 'running' } });
  const handlePause = () => patchStatus.mutate({ data: { status: 'paused' } });
  const handleComplete = () => patchStatus.mutate({ data: { status: 'completed' } });
  const handleReset = () => patchStatus.mutate({ data: { status: 'idle' } });
  const handleSync = () => syncGiveaway.mutate();

  const handleDisconnect = () => {
    const confirmed = window.confirm(
      'دڵنیایت لە پچڕاندنی پەیوەندی Meta؟ هەموو خەڵات و ڕیزبەندییە هەڵگیراوەکان دەسڕێنەوە.',
    );
    if (!confirmed) return;

    disconnectMeta.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.reload();
      }
    });
  };

  const statusTranslations: Record<string, string> = {
    'idle': 'ئامادە',
    'running': 'ڕاستەوخۆ',
    'paused': 'وەستاوە',
    'completed': 'کۆتایی هاتووە'
  };

  const currentStatus = giveaway?.status || 'idle';
  const participants = giveaway?.participants || [];
  const totalComments = giveaway?.totalComments || 0;
  const totalParticipants = giveaway?.totalParticipants || participants.length;
  const canMutate = Boolean(metaStatus?.connected && metaStatus.csrfToken);

  const getRankStyle = (index: number) => {
    if (index === 0) return 'bg-yellow-400/20 text-yellow-700';
    if (index === 1) return 'bg-gray-300/30 text-gray-700';
    if (index === 2) return 'bg-amber-600/20 text-amber-700';
    return 'text-muted-foreground bg-muted/50';
  };

  const getErrorMessage = (error: unknown) => {
    if (!error) return null;
    const objectError = typeof error === 'object' && error !== null
      ? error as { data?: { error?: string }; message?: string; status?: number }
      : null;
    const msg = typeof error === 'string'
      ? error
      : objectError?.data?.error || objectError?.message || '';
    const normalized = msg.toLowerCase();

    if (objectError?.status === 401 || normalized.includes('not authenticated') || normalized.includes('authorization expired') || normalized.includes('revoked')) {
      return 'پەیوەندی Meta بەسەرچووە یان پچڕاوە؛ تکایە دووبارە پەیوەستی بکەرەوە.';
    }
    if (objectError?.status === 403 && !normalized.includes('csrf')) {
      return 'Meta مۆڵەتی پێویستی نەداوە؛ تکایە مۆڵەتەکان بپشکنە و دووبارە پەیوەستی بکەرەوە.';
    }
    if (objectError?.status === 409) {
      return 'نوێکردنەوەیەکی دیکە لە ئێستادا بەردەوامە؛ چەند چرکەیەک چاوەڕێ بکە و دووبارە هەوڵ بدەرەوە.';
    }
    if (normalized.includes('csrf')) {
      return 'پاراستنی دانیشتن نوێ بووەتەوە؛ پەڕەکە نوێ بکەرەوە و دووبارە هەوڵ بدەرەوە.';
    }
    if (normalized.includes('no active giveaway') || normalized.includes('no post selected')) {
      return 'سەرەتا پۆستێک بۆ خەڵاتەکە هەڵبژێرە و پاشەکەوتی بکە.';
    }
    if (normalized.includes('asset') || normalized.includes('post')) {
      return 'پەیج یان پۆستە هەڵبژێردراوەکە نادروستە؛ تکایە دووبارە هەڵیبژێرە.';
    }
    return 'کێشەیەک ڕوویدا؛ تکایە دووبارە هەوڵ بدەرەوە.';
  };

  const actionError =
    putGiveaway.error ||
    patchStatus.error ||
    syncGiveaway.error ||
    disconnectMeta.error ||
    assetsError ||
    postsError;

  if (isMetaLoading) {
    return (
      <div dir="rtl" className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        <RefreshCw className="w-8 h-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background text-foreground p-3 sm:p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <img src="/gyadarmany-ranya-logo.png" alt="لۆگۆی گیادەرمانی سروشتی ڕانیە" className="w-12 h-12 md:w-14 md:h-14 rounded-full shadow-sm bg-white shrink-0" />
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-primary leading-tight">گیادەرمانی سروشتی ڕانیە</h1>
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 mt-1 text-sm md:text-base font-medium">
                سەنتەری بەڕێوەبردنی خەڵاتە ڕاستەوخۆکان
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  {giveaway?.exists ? statusTranslations[currentStatus] : 'دیارینەکراو'}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Button variant="outline" onClick={() => window.open(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/live`, '_blank')} className="w-full md:w-auto gap-2 font-semibold border-primary/30 hover:bg-primary/5 text-primary h-11 md:h-10">
              <ExternalLink className="w-4 h-4" />
              کردنەوەی شاشەی ڕاستەوخۆ
            </Button>
          </div>
        </div>

        {metaStatus && !metaStatus.configured && (
          <Card className="border-destructive/50 bg-destructive/5 shadow-sm">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                پێویستە هەژماری مێتا ڕێکبخرێت
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-medium">بۆ بەکارهێنانی ئەم سیستمە، پێویستە سەرەتا زانیارییەکانی مێتا (Facebook/Instagram) لە ڕێکخستنەکانی ڕاژەدا زیاد بکەیت.</p>
              <div className="bg-background/80 p-3 rounded border font-mono text-sm break-all text-left" dir="ltr">
                {metaStatus.callbackUrl}
              </div>
              <p className="text-sm text-muted-foreground">ئەم بەستەرەی سەرەوە لە ڕێکخستنەکانی Meta App زیاد بکە وەکوو Valid OAuth Redirect URI. هەروەها دڵنیابە لە دانانی App ID، App Secret و Facebook Page ID ـی ڕێگەپێدراو.</p>
            </CardContent>
          </Card>
        )}

        {metaStatus?.configured && !metaStatus.connected && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>بەستنەوەی هەژمار</CardTitle>
            </CardHeader>
            <CardContent>
              {metaState === 'error' && (
                <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded border border-destructive/20 text-sm font-medium">
                  هەڵەیەک ڕوویدا لە کاتی بەستنەوەی هەژمارەکە. تکایە دووبارە هەوڵ بدەرەوە.
                </div>
              )}
              <p className="mb-4 text-muted-foreground">پێویستە هەژماری فەیسبووک یان ئینستاگرامەکەت ببەستیتەوە بۆ وەرگرتنی کۆمێنتەکان لە کاتی ڕاستەقینەدا.</p>
              <Button onClick={() => window.location.href = '/api/meta/login'} className="gap-2 h-12 text-base px-6">
                <Facebook className="w-5 h-5" />
                بەستنەوەی فەیسبووک / ئینستاگرام
              </Button>
            </CardContent>
          </Card>
        )}

        {metaStatus?.connected && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Settings & Controls */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center justify-between text-lg">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-muted-foreground" />
                      ڕێکخستنی خەڵات
                    </div>
                    {metaStatus.adminName && (
                      <Badge variant="outline" className="gap-1 font-normal text-xs bg-muted/30">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        {metaStatus.adminName}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {actionError && (
                    <div className="p-3 bg-destructive/10 text-destructive rounded border border-destructive/20 text-sm font-medium">
                      {getErrorMessage(actionError)}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">پەیج یان هەژمار</label>
                    <select
                      className="flex h-11 md:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                      value={selectedAssetId}
                      onChange={e => {
                        setSelectedAssetId(e.target.value);
                        setSelectedPostId('');
                      }}
                      disabled={giveaway?.status !== 'idle' && giveaway?.exists}
                    >
                      <option value="">-- هەڵبژێرە --</option>
                      {assets?.map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({a.platform === 'facebook' ? 'فەیسبووک' : 'ئینستاگرام'})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold">پۆست</label>
                    <select
                      className="flex h-11 md:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                      value={selectedPostId}
                      onChange={e => setSelectedPostId(e.target.value)}
                      disabled={!selectedAssetId || (giveaway?.status !== 'idle' && giveaway?.exists)}
                    >
                      <option value="">-- هەڵبژێرە --</option>
                      {giveaway?.exists && giveaway.postId && !posts?.find(p => p.id === giveaway.postId) && (
                        <option value={giveaway.postId}>
                          {giveaway.postMessage ? (giveaway.postMessage.substring(0, 50) + (giveaway.postMessage.length > 50 ? '...' : '')) : 'هەڵبژێردراوی پێشوو (زانیاری نادیارە)'}
                        </option>
                      )}
                      {posts?.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.message ? (p.message.substring(0, 50) + (p.message.length > 50 ? '...' : '')) : `پۆستی ${new Date(p.createdAt).toLocaleDateString()}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold">ناونیشانی خەڵات</label>
                    <Input
                      value={prizeTitle}
                      onChange={e => setPrizeTitle(e.target.value)}
                      placeholder="نموونە: خەڵاتی پایزە..."
                      className="h-11 md:h-10 bg-background"
                      disabled={giveaway?.status !== 'idle' && giveaway?.exists}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold">ژمارەی براوەکان</label>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={prizeCount || ''}
                      onChange={e => setPrizeCount(parseInt(e.target.value) || 1)}
                      dir="ltr"
                      className="text-start h-11 md:h-10 bg-background"
                      disabled={giveaway?.status !== 'idle' && giveaway?.exists}
                    />
                  </div>

                  {(!giveaway?.exists || giveaway?.status === 'idle') && (
                    <Button
                      className="w-full h-11 md:h-10 mt-2"
                      onClick={handleSaveGiveaway}
                      disabled={!canMutate || !selectedAssetId || !selectedPostId || !prizeCount || !prizeTitle || putGiveaway.isPending}
                    >
                      {putGiveaway.isPending ? 'خەریکە...' : 'پاشەکەوتکردن'}
                    </Button>
                  )}

                  <div className="pt-4 border-t mt-4">
                     <Button variant="ghost" onClick={handleDisconnect} disabled={!canMutate || disconnectMeta.isPending} className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive">
                       <LogOut className="w-4 h-4 ml-2" />
                       پچڕاندنی پەیوەندی مێتا
                     </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">کۆنتڕۆڵەکانی پەخش</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {giveaway?.lastError && (
                    <div className="p-3 mb-2 bg-destructive/10 text-destructive rounded border border-destructive/20 text-sm font-medium">
                      هەڵەی پێشوو: {getErrorMessage(giveaway.lastError)}
                    </div>
                  )}

                  {currentStatus === 'idle' || currentStatus === 'paused' ? (
                    <Button
                      className="w-full gap-2 text-base h-12"
                      size="lg"
                      onClick={handleStart}
                      disabled={!canMutate || !giveaway?.exists || patchStatus.isPending}
                    >
                      <Play className="w-5 h-5 fill-current rotate-180" />
                      {currentStatus === 'idle' ? 'دەستپێکردنی چاودێریکردن' : 'دەستپێکردنەوەی چاودێریکردن'}
                    </Button>
                  ) : currentStatus === 'running' ? (
                    <Button
                      className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white shadow-sm text-base h-12"
                      size="lg"
                      onClick={handlePause}
                      disabled={!canMutate || patchStatus.isPending}
                    >
                      <Pause className="w-5 h-5 fill-current" />
                      وەستاندنی چاودێریکردن
                    </Button>
                  ) : null}

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="gap-2 h-11 md:h-10"
                      onClick={handleSync}
                      disabled={!canMutate || !giveaway?.exists || syncGiveaway.isPending}
                    >
                      <RefreshCw className={`w-4 h-4 ${syncGiveaway.isPending ? 'animate-spin' : ''}`} />
                      نوێکردنەوە
                    </Button>
                    {currentStatus !== 'completed' ? (
                      <Button
                        variant="outline"
                        className="gap-2 border-primary/50 text-primary hover:bg-primary hover:text-white transition-colors h-11 md:h-10"
                        onClick={handleComplete}
                        disabled={!canMutate || !giveaway?.exists || patchStatus.isPending}
                      >
                        <Trophy className="w-4 h-4" />
                        ئاشکراکردنی براوەکان
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="gap-2 h-11 md:h-10"
                        onClick={handleReset}
                        disabled={!canMutate || patchStatus.isPending}
                      >
                        سەرلەنوێ ڕێکخستنەوە
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-primary text-primary-foreground border-none shadow-sm">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center h-28">
                    <span className="text-3xl md:text-4xl font-extrabold" dir="ltr">{totalParticipants}</span>
                    <span className="text-primary-foreground/90 text-sm font-semibold mt-1">بەشداربووان</span>
                  </CardContent>
                </Card>
                <Card className="bg-secondary text-secondary-foreground border-none shadow-sm">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center h-28">
                    <span className="text-3xl md:text-4xl font-extrabold" dir="ltr">{totalComments}</span>
                    <span className="text-secondary-foreground/90 text-sm font-semibold mt-1">کۆمێنتەکان</span>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Leaderboard Preview */}
            <Card className="lg:col-span-2 flex flex-col overflow-hidden shadow-sm">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <CardTitle className="text-lg">لیستی ڕیزبەندی ڕاستەوخۆ</CardTitle>
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-2" dir="ltr">
                    <span className="relative flex h-2 w-2">
                      {currentStatus === 'running' && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      )}
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${currentStatus === 'running' ? 'bg-green-500' : 'bg-muted-foreground'}`}></span>
                    </span>
                    <span dir="rtl">
                      {giveaway?.lastSyncedAt
                        ? `نوێکرایەوە لە ${new Date(giveaway.lastSyncedAt).toLocaleTimeString()}`
                        : 'هێشتا نوێنەکراوەتەوە'}
                    </span>
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col min-h-0 bg-background/50">
                <div className="flex flex-col min-w-0">
                  {/* Desktop Table Header */}
                  <div className="hidden md:flex items-center px-4 py-3 text-xs font-bold text-muted-foreground bg-muted/50 sticky top-0 backdrop-blur-md z-10 border-b">
                    <div className="w-16 text-start">پلە</div>
                    <div className="flex-1 text-start">بەشداربوو</div>
                    <div className="w-24 text-center">سەرچاوە</div>
                    <div className="w-32 text-end">کۆمێنتەکان</div>
                    <div className="w-32 text-start ms-4">بارودۆخ</div>
                  </div>

                  {/* List Items */}
                  <div className="flex flex-col p-3 md:p-0 overflow-y-auto max-h-[500px] md:max-h-[650px] gap-3 md:gap-0">
                    {participants.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground font-medium">
                        هیچ بەشداربوویەک نییە
                      </div>
                    ) : (
                      participants.slice(0, 50).map((p, i) => (
                        <div key={p.participantKey} className="flex flex-col md:flex-row md:items-center p-4 md:p-0 bg-card md:bg-transparent border border-border/60 md:border-b md:border-x-0 md:border-t-0 rounded-xl md:rounded-none hover:bg-muted/30 transition-colors shadow-sm md:shadow-none min-w-0">

                          {/* Mobile Header: Rank & Status */}
                          <div className="flex items-center justify-between md:hidden w-full mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-muted-foreground">پلە:</span>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${getRankStyle(i)}`}>
                                {p.rank}
                              </div>
                            </div>
                            {currentStatus === 'completed' && p.rank <= (giveaway?.prizeCount || 0) ? (
                              <Badge className="bg-green-500/10 text-green-700 border-green-500/30 font-bold">براوە</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs font-medium tracking-wider">چاودێریکردن</span>
                            )}
                          </div>

                          {/* Desktop Rank */}
                          <div className="hidden md:flex w-16 px-4 py-3 font-bold text-start">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${getRankStyle(i)}`}>
                              {p.rank}
                            </div>
                          </div>

                          {/* Participant Info */}
                          <div className="flex-1 md:px-4 md:py-3 flex items-center gap-3 min-w-0">
                            <Avatar name={p.displayName} profilePhotoUrl={p.profilePictureUrl || undefined} className="w-12 h-12 md:w-8 md:h-8 text-sm md:text-xs shrink-0" />
                            <span className="font-bold text-foreground/90 text-lg md:text-sm whitespace-normal break-words leading-tight" dir="ltr">{p.displayName}</span>
                          </div>

                          {/* Mobile Footer: Source & Comments */}
                          <div className="flex items-center justify-between md:hidden w-full pt-3 mt-1 border-t border-border/50">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                              {p.platform === 'instagram' ? (
                                <><Instagram className="w-5 h-5 text-pink-600" /><span>ئینستاگرام</span></>
                              ) : (
                                <><Facebook className="w-5 h-5 text-blue-600" /><span>فەیسبووک</span></>
                              )}
                            </div>
                            <div className="font-mono font-bold text-primary text-xl" dir="ltr">
                              {p.commentCount.toLocaleString()}
                            </div>
                          </div>

                          {/* Desktop Source, Comments, Status */}
                          <div className="hidden md:flex w-24 px-4 py-3 text-muted-foreground justify-center">
                            {p.platform === 'instagram' ? (
                              <div title="ئینستاگرام"><Instagram className="w-4 h-4" /></div>
                            ) : (
                              <div title="فەیسبووک"><Facebook className="w-4 h-4" /></div>
                            )}
                          </div>
                          <div className="hidden md:block w-32 px-4 py-3 text-end font-mono font-bold text-primary" dir="ltr">
                            {p.commentCount.toLocaleString()}
                          </div>
                          <div className="hidden md:block w-32 px-4 py-3 text-start ms-4">
                            {currentStatus === 'completed' && p.rank <= (giveaway?.prizeCount || 0) ? (
                              <Badge className="bg-green-500/10 text-green-700 border-green-500/30 font-bold">براوە</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs font-medium tracking-wider">چاودێریکردن</span>
                            )}
                          </div>

                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
