import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import DialerPopup from './DialerPopup';
import { OPEN_DIALER_EVENT, type DialerTarget } from '../dialer-events';
import { useAuth } from '../context/AuthContext';

const EMPTY_TARGET: DialerTarget = { phone: '' };

export default function FloatingDialerWrapper() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<DialerTarget>(EMPTY_TARGET);

  useEffect(() => {
    const handleOpenDialer = (event: Event) => {
      const targetEvent = event as CustomEvent<DialerTarget>;
      setTarget(targetEvent.detail || EMPTY_TARGET);
      setIsOpen(true);
    };

    window.addEventListener(OPEN_DIALER_EVENT, handleOpenDialer);
    return () => window.removeEventListener(OPEN_DIALER_EVENT, handleOpenDialer);
  }, []);

  const closeDialer = () => {
    setIsOpen(false);
    setTarget(EMPTY_TARGET);
  };

  if (user?.role === 'agent' && user.can_call === false) return null;

  return (
    <>
      {!isOpen && (
        <button 
          onClick={() => {
            setTarget(EMPTY_TARGET);
            setIsOpen(true);
          }}
          className="fixed bottom-6 right-6 w-16 h-16 rounded-full bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] flex items-center justify-center transition-transform hover:scale-105 z-50"
        >
          <Phone size={24} className="animate-pulse" />
        </button>
      )}
      <DialerPopup
        phone={target.phone}
        contactId={target.contactId}
        contactName={target.contactName}
        contactCompany={target.contactCompany}
        isOpen={isOpen}
        autoStart={Boolean(target.autoStart)}
        onClose={closeDialer}
      />
    </>
  );
}
