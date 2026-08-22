import { useGiveawayStore, Participant } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, MessageCircle } from 'lucide-react';

export default function LiveView() {
  const { state } = useGiveawayStore();
  
  const top3 = state.participants.slice(0, 3);
  const rest = state.participants.slice(3, 20);

  return (
    <div dir="rtl" className="dark min-h-[100dvh] bg-background text-foreground overflow-x-hidden overflow-y-auto font-sans selection:bg-primary/30">
      
      {/* Decorative background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -start-[10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute top-[60%] -end-[10%] w-[40%] h-[60%] rounded-full bg-secondary/20 blur-[120px]" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
      </div>

      <div className="relative z-10 flex flex-col min-h-[100dvh] lg:h-[100dvh] p-4 sm:p-6 lg:p-8 max-w-[1800px] mx-auto">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center md:items-start justify-between gap-4 mb-6 lg:mb-12 text-center md:text-start">
          <div className="flex flex-col md:flex-row items-center gap-4 lg:gap-5">
            <div className="w-16 h-16 lg:w-20 lg:h-20 bg-white rounded-full flex items-center justify-center shadow-lg shadow-primary/30 shrink-0 p-1">
              <img src="/gyadarmany-ranya-logo.png" alt="لۆگۆی گیادەرمانی سروشتی ڕانیە" className="w-full h-full object-cover rounded-full" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-wider whitespace-normal break-words leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 drop-shadow-sm">
                گیادەرمانی سروشتی ڕانیە
              </h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-2">
                <span className="text-primary font-bold tracking-widest text-xs sm:text-sm bg-primary/10 px-3 py-1 rounded-md border border-primary/20">
                  {state.title}
                </span>
                <span className="text-muted-foreground font-mono font-medium flex items-center gap-2 text-sm sm:text-base">
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span dir="ltr">{state.totalComments.toLocaleString()}</span> کۆی کۆمێنتەکان
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 shrink-0">
            {state.status === 'running' && (
              <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-secondary/15 border border-secondary/30 shadow-[0_0_20px_rgba(219,39,119,0.3)]">
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-secondary"></span>
                </span>
                <span className="text-secondary font-black tracking-widest text-sm">ڕاستەوخۆ</span>
              </div>
            )}
            {state.status === 'completed' && (
              <div className="px-6 py-2.5 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-black tracking-widest shadow-lg shadow-yellow-500/20 text-sm sm:text-base whitespace-nowrap">
                ئەنجامی کۆتایی
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col lg:flex-row gap-8 lg:gap-12 w-full lg:items-end pb-4 lg:pb-8 min-h-0">
          
          {/* Podium */}
          <div className="w-full lg:flex-1 flex items-end justify-center gap-1 sm:gap-4 lg:gap-10 min-h-[300px] md:min-h-[400px] lg:min-h-0 lg:h-full shrink-0">
            <PodiumPosition participant={top3[1]} rank={2} heightClass="h-[100px] sm:h-[180px] lg:h-[40%]" color="from-slate-400 to-slate-600" isCompleted={state.status === 'completed'} />
            <PodiumPosition participant={top3[0]} rank={1} heightClass="h-[140px] sm:h-[250px] lg:h-[55%]" color="from-yellow-300 to-yellow-600" isCompleted={state.status === 'completed'} />
            <PodiumPosition participant={top3[2]} rank={3} heightClass="h-[70px] sm:h-[130px] lg:h-[30%]" color="from-amber-600 to-amber-800" isCompleted={state.status === 'completed'} />
          </div>

          {/* List */}
          <div className="w-full lg:w-[450px] xl:w-[500px] flex flex-col shrink-0 min-h-[400px] h-[55vh] lg:h-full bg-card/40 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl mt-4 lg:mt-0">
            <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-white/10 bg-white/5">
              <h3 className="font-extrabold text-base sm:text-lg tracking-widest text-white/90">ڕکابەرەکان</h3>
            </div>
            <div className="flex-1 overflow-hidden p-3 sm:p-5 relative flex flex-col">
              <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-card/60 to-transparent z-10 pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card/60 to-transparent z-10 pointer-events-none" />
              
              <div className="flex-1 overflow-y-auto ps-2 pb-10">
                <ul className="space-y-3 sm:space-y-4">
                  <AnimatePresence mode="popLayout">
                    {rest.map((p) => (
                      <motion.li
                        key={p.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9, x: -20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9, x: 20 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        className="relative bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 shadow-sm min-w-0"
                      >
                        {state.status === 'completed' && p.rank <= state.prizeCount && (
                          <div className="absolute -start-2 -top-2 bg-yellow-500 text-black p-1.5 rounded-full shadow-lg">
                            <Trophy className="w-3 sm:w-3.5 h-3 sm:h-3.5 fill-black/20" />
                          </div>
                        )}
                        <div className="w-6 sm:w-8 font-mono font-extrabold text-muted-foreground/70 text-start text-base sm:text-lg shrink-0" dir="ltr">
                          #{p.rank}
                        </div>
                        <Avatar name={p.name} profilePhotoUrl={p.profilePhotoUrl} className="w-10 h-10 sm:w-12 sm:h-12 shadow-md border border-white/10 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-extrabold text-base sm:text-lg whitespace-normal break-words leading-tight text-white/95">{p.name}</div>
                        </div>
                        <div className="font-mono font-bold text-primary bg-primary/10 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center gap-1.5 sm:gap-2 border border-primary/20 shrink-0 text-sm sm:text-base" dir="ltr">
                          {p.commentCount.toLocaleString()}
                          <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-70" />
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {state.status === 'completed' && <Confetti />}
    </div>
  );
}

function PodiumPosition({ 
  participant, 
  rank, 
  heightClass, 
  color,
  isCompleted
}: { 
  participant?: Participant, 
  rank: number, 
  heightClass: string, 
  color: string,
  isCompleted: boolean
}) {
  if (!participant) return null;
  
  return (
    <div className="flex flex-col items-center w-[32%] lg:w-[28%] max-w-[280px] relative shrink-0">
      <motion.div 
        layout
        className="flex flex-col items-center mb-4 sm:mb-8 z-10 w-full"
      >
        <div className="relative shrink-0">
          <Avatar name={participant.name} profilePhotoUrl={participant.profilePhotoUrl} className={`w-14 h-14 sm:w-24 sm:h-24 lg:w-36 lg:h-36 text-xl sm:text-3xl lg:text-5xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border-[3px] sm:border-[4px] lg:border-[6px] ${rank === 1 ? 'border-yellow-400' : rank === 2 ? 'border-slate-300' : 'border-amber-600'}`} />
          {isCompleted && (
            <motion.div 
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", bounce: 0.6, delay: rank * 0.2 }}
              className="absolute -bottom-2 sm:-bottom-4 -end-2 sm:-end-4 bg-white text-black w-7 h-7 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shadow-xl border-[2px] sm:border-4 border-background"
            >
              <Trophy className="w-3.5 h-3.5 sm:w-6 sm:h-6 fill-black/20" />
            </motion.div>
          )}
        </div>
        <div className="mt-3 sm:mt-5 text-center flex flex-col items-center w-full px-1">
          <div className="font-black text-sm sm:text-xl lg:text-3xl whitespace-normal break-words text-center w-full leading-tight drop-shadow-md">{participant.name}</div>
          <div className="text-primary font-mono font-bold text-xs sm:text-lg lg:text-2xl flex flex-wrap items-center justify-center gap-1 sm:gap-2 mt-1 sm:mt-2 bg-background/50 backdrop-blur-sm px-2 sm:px-4 py-1 sm:py-1.5 rounded-full border border-white/5 w-fit max-w-full" dir="ltr">
            <MessageCircle className="w-3 h-3 sm:w-5 sm:h-5 opacity-70 shrink-0" />
            <span className="truncate">{participant.commentCount.toLocaleString()}</span>
          </div>
        </div>
      </motion.div>
      
      <motion.div 
        layout
        className={`w-full ${heightClass} rounded-t-xl sm:rounded-t-3xl bg-gradient-to-t ${color} relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.3)] before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:to-transparent before:opacity-30 before:mix-blend-overlay`}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.15]">
          <span className="text-5xl sm:text-9xl lg:text-[12rem] font-black text-black mix-blend-overlay tracking-tighter" dir="ltr">{rank}</span>
        </div>
        <div className="absolute top-0 inset-x-0 h-1 sm:h-1.5 bg-white/40" />
        <div className="absolute top-1 sm:top-1.5 inset-x-0 h-px bg-white/20" />
      </motion.div>
    </div>
  );
}

function Confetti() {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {[...Array(80)].map((_, i) => {
        const left = Math.random() * 100;
        const animDuration = 3 + Math.random() * 4;
        const delay = Math.random() * 3;
        const size = 6 + Math.random() * 12;
        const colors = ['#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#a78bfa', '#818cf8', '#60a5fa', '#fef08a'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        return (
          <div 
            key={i}
            className="absolute top-[-10%] rounded-sm"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              backgroundColor: color,
              animation: `fall ${animDuration}s linear ${delay}s infinite`,
              transform: `rotate(${Math.random() * 360}deg)`,
              boxShadow: `0 0 10px ${color}80`
            }}
          />
        );
      })}
      <style>{`
        @keyframes fall {
          0% { transform: translateY(-5vh) rotate(0deg); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(105vh) rotate(1080deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
