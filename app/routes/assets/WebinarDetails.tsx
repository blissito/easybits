import { AttributeList } from "./template";

// Minimal type definitions to avoid conflicts with Prisma types
interface AssetMetadata {
  numberOfSessions?: string | number | null;
  eventDate?: string | Date | null;
  [key: string]: any;
}

interface UserData {
  storeConfig?: {
    typography?: string;
    [key: string]: any;
  } | null;
  [key: string]: any;
}

interface AssetWithUser {
  metadata?: AssetMetadata | null;
  user?: UserData | null;
  [key: string]: any;
}

const WebinarDetails = ({ asset }: { asset: AssetWithUser }) => {
  const typography = asset?.user?.storeConfig?.typography || 'sans-serif';
  
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return 'No definida';
    
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return 'Fecha inválida';
      
      return dateObj.toLocaleString("es-MX", {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Error al formatear fecha';
    }
  };

  // Safely access metadata and root asset properties
  const metadata = asset?.metadata || {};
  // Check both metadata.eventDate and asset.eventDate
  const eventDate = metadata.eventDate || (asset as any).eventDate;
  
  return (
    <section style={{ fontFamily: typography }}>
      {metadata.numberOfSessions && (
        <AttributeList
          textLeft="No. de sesiones"
          textRight={String(metadata.numberOfSessions)}
        />
      )}

      <AttributeList
        textLeft="Modalidad"
        textRight={
          <div className="flex gap-2 items-center">
            <div className="relative w-3 h-3">
              <div className="rounded-full absolute inset-0 blur-xs animate-pulse" />
              <div className="bg-red-500 rounded-full absolute inset-[.1px]" />
            </div>
            En vivo
          </div>
        }
      />

      <AttributeList 
        textLeft="Fecha" 
        textRight={formatDate(eventDate)} 
      />
    </section>
  );
};

export default WebinarDetails;
