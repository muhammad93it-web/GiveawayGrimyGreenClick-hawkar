import { useEffect, useState } from "react"
import { cn } from "@/components/ui/shared"

export function Avatar({ name, profilePhotoUrl, className }: { name: string, profilePhotoUrl?: string, className?: string }) {
  const [imageFailed, setImageFailed] = useState(false)
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  
  const colors = [
    'bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500', 
    'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'
  ]
  const colorIndex = name.length % colors.length

  useEffect(() => {
    setImageFailed(false)
  }, [profilePhotoUrl])
  
  return (
    <div className={cn("relative flex items-center justify-center rounded-full text-white font-bold shrink-0 overflow-hidden", colors[colorIndex], className)}>
      {profilePhotoUrl && !imageFailed ? (
        <img
          src={profilePhotoUrl}
          alt={`وێنەی پرۆفایلی ${name}`}
          className="w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials
      )}
    </div>
  )
}
