import { useState, useEffect } from 'react';
import { useGiveawayStore, simulateNewComments } from '@/lib/store';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input } from '@/components/ui/shared';
import { Avatar } from '@/components/Avatar';
import { Play, Pause, RefreshCw, Trophy, ExternalLink, Settings, Info, Facebook, Instagram } from 'lucide-react';

export default function Dashboard() {
  const { state, updateState } = useGiveawayStore();
  const [postUrl, setPostUrl] = useState(state.postUrl);
  
  useEffect(() => {
    let interval: number;
    if (state.status === 'running') {
      interval = window.setInterval(() => {
        updateState(simulateNewComments);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [state.status, updateState]);

  const handleStart = () => updateState({ status: 'running' });
  const handlePause = () => updateState({ status: 'paused' });
  const handleComplete = () => updateState({ status: 'completed' });
  const handleReset = () => {
    updateState({
      status: 'idle',
      participants: state.participants.map(p => ({ ...p, commentCount: Math.floor(Math.random() * 20), winnerStatus: 'pending' }))
    });
  }

  const statusTranslations: Record<string, string> = {
    'idle': 'ئامادە',
    'running': 'ڕاستەوخۆ',
    'paused': 'وەستاوە',
    'completed': 'کۆتایی هاتووە'
  };

  const getRankStyle = (index: number) => {
    if (index === 0) return 'bg-yellow-400/20 text-yellow-700';
    if (index === 1) return 'bg-gray-300/30 text-gray-700';
    if (index === 2) return 'bg-amber-600/20 text-amber-700';
    return 'text-muted-foreground bg-muted/50';
  };

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
                  {statusTranslations[state.status]}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Button variant="outline" onClick={() => window.open('/live', '_blank')} className="w-full md:w-auto gap-2 font-semibold border-primary/30 hover:bg-primary/5 text-primary h-11 md:h-10">
              <ExternalLink className="w-4 h-4" />
              کردنەوەی شاشەی ڕاستەوخۆ
            </Button>
          </div>
        </div>

        {/* Warning about demo mode */}
        <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4 flex gap-4 items-start shadow-sm">
          <div className="bg-secondary/20 p-2 rounded-full text-secondary shrink-0 mt-0.5">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-secondary-foreground text-base">دۆخی تاقیکردنەوە چالاکە</h4>
            <p className="text-sm text-secondary-foreground/80 mt-1 font-medium leading-relaxed">
              هەژمارەکانی فەیسبووک و ئینستاگرامەکەت ببەستەوە لە ڕێکخستنەکان بۆ چالاککردنی هاوکاتکردنی کۆمێنتەکان. لە ئێستادا بە داتای تاقیکردنەوە کاردەکات.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Settings & Controls */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="w-5 h-5 text-muted-foreground" />
                  ڕێکخستنی خەڵات
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">بەستەری پۆستی مەبەست</label>
                  <div className="flex gap-2">
                    <Input 
                      value={postUrl} 
                      onChange={e => setPostUrl(e.target.value)} 
                      placeholder="https://instagram.com/p/..."
                      dir="ltr"
                      className="text-start h-11 md:h-10"
                    />
                    <Button 
                      variant="secondary" 
                      onClick={() => updateState({ postUrl })}
                      className="h-11 md:h-10 px-6 shrink-0"
                    >
                      بارکردن
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold">ژمارەی براوەکان</label>
                  <Input 
                    type="number" 
                    min="1" 
                    max="10" 
                    value={state.prizeCount} 
                    onChange={e => updateState({ prizeCount: parseInt(e.target.value) || 1 })}
                    dir="ltr"
                    className="text-start h-11 md:h-10"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">کۆنتڕۆڵەکانی پەخش</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.status === 'idle' || state.status === 'paused' ? (
                  <Button className="w-full gap-2 text-base h-12" size="lg" onClick={handleStart}>
                    <Play className="w-5 h-5 fill-current rotate-180" />
                    {state.status === 'idle' ? 'دەستپێکردنی چاودێریکردن' : 'دەستپێکردنەوەی چاودێریکردن'}
                  </Button>
                ) : state.status === 'running' ? (
                  <Button className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white shadow-sm text-base h-12" size="lg" onClick={handlePause}>
                    <Pause className="w-5 h-5 fill-current" />
                    وەستاندنی چاودێریکردن
                  </Button>
                ) : null}
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Button variant="outline" className="gap-2 h-11 md:h-10" onClick={() => updateState(simulateNewComments)}>
                    <RefreshCw className="w-4 h-4" />
                    نوێکردنەوە
                  </Button>
                  {state.status !== 'completed' ? (
                    <Button variant="outline" className="gap-2 border-primary/50 text-primary hover:bg-primary hover:text-white transition-colors h-11 md:h-10" onClick={handleComplete}>
                      <Trophy className="w-4 h-4" />
                      ئاشکراکردنی براوەکان
                    </Button>
                  ) : (
                    <Button variant="outline" className="gap-2 h-11 md:h-10" onClick={handleReset}>
                      سەرلەنوێ ڕێکخستنەوە
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-primary text-primary-foreground border-none shadow-sm">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center h-28">
                  <span className="text-3xl md:text-4xl font-extrabold" dir="ltr">{state.participantCount}</span>
                  <span className="text-primary-foreground/90 text-sm font-semibold mt-1">بەشداربووان</span>
                </CardContent>
              </Card>
              <Card className="bg-secondary text-secondary-foreground border-none shadow-sm">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center h-28">
                  <span className="text-3xl md:text-4xl font-extrabold" dir="ltr">{state.totalComments}</span>
                  <span className="text-secondary-foreground/90 text-sm font-semibold mt-1">کۆمێنتەکان</span>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Leaderboard Preview */}
          <Card className="lg:col-span-2 flex flex-col overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-lg">لیستی ڕیزبەندی ڕاستەوخۆ</CardTitle>
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-2" dir="ltr">
                  <span className="relative flex h-2 w-2">
                    {state.status === 'running' && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    )}
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span dir="rtl">نوێکرایەوە لە {new Date(state.lastSyncedAt).toLocaleTimeString()}</span>
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
                  {state.participants.slice(0, 50).map((p, i) => (
                    <div key={p.id} className="flex flex-col md:flex-row md:items-center p-4 md:p-0 bg-card md:bg-transparent border border-border/60 md:border-b md:border-x-0 md:border-t-0 rounded-xl md:rounded-none hover:bg-muted/30 transition-colors shadow-sm md:shadow-none min-w-0">
                      
                      {/* Mobile Header: Rank & Status */}
                      <div className="flex items-center justify-between md:hidden w-full mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground">پلە:</span>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${getRankStyle(i)}`}>
                            {p.rank}
                          </div>
                        </div>
                        {state.status === 'completed' && p.rank <= state.prizeCount ? (
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
                        <Avatar name={p.name} profilePhotoUrl={p.profilePhotoUrl} className="w-12 h-12 md:w-8 md:h-8 text-sm md:text-xs shrink-0" />
                        <span className="font-bold text-foreground/90 text-lg md:text-sm whitespace-normal break-words leading-tight" dir="ltr">{p.name}</span>
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
                        {state.status === 'completed' && p.rank <= state.prizeCount ? (
                          <Badge className="bg-green-500/10 text-green-700 border-green-500/30 font-bold">براوە</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs font-medium tracking-wider">چاودێریکردن</span>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}