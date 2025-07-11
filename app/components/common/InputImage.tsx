import { motion, type HTMLMotionProps } from 'motion/react';
import { ImageIcon } from '../icons/image';
import { cn } from '~/utils/cn';
import { useDropFiles } from '~/hooks/useDropFiles';
import { IoClose, IoReload, IoTrash } from 'react-icons/io5';
import { useState } from 'react';

interface InputImageProps {
  align?: 'center' | 'left' | 'right' | 'none';
  alignText?: 'center' | 'left' | 'right';
  allowPreview?: boolean;
  buttonClassName?: React.HTMLAttributes<typeof motion.button>['className'];
  buttonProps?: HTMLMotionProps<"button">;
  closable?: boolean;
  currentPreview?: string;
  isHorizontal?: boolean;
  onChange?: (file: File[]) => void;
  onClose?: PreviewProps['onClose'];
  onDelete?: (name?: string) => void;
  onDrop?: (files: File[]) => void;
  onReload?: PreviewProps['onReload'];
  persistFiles?: boolean;
  placeholder?: string;
  placeholderClassName?: React.HTMLAttributes<any>['className'];
  reloadable?: PreviewProps['reloadable'];
  name?: string;
  mode?: 'single' | 'multiple' // TODO: working multiple selection
}

function InputImage({
  name,
  align = 'center',
  alignText = 'center',
  allowPreview,
  buttonClassName,
  buttonProps,
  closable = true,
  currentPreview,
  isHorizontal,
  onChange,
  onClose,
  onDelete,
  onDrop,
  onReload,
  persistFiles = true,
  placeholder,
  placeholderClassName,
  reloadable,
  mode = 'single',
}: InputImageProps) {
  const [isRemoved, setIsRemoved] = useState(false);

  const {
    ref,
    files,
    removeFile,
    isHovered,
  } = useDropFiles<HTMLButtonElement>({ onDrop, onChange, persistFiles, name, mode });


  const handleOnClose = () => {
    if (closable) {
      if (files.length) removeFile(0);
      onClose?.();
    }
  }

  const handleOnReload = () => {
    if (reloadable) {
      ref.current?.click();
      onReload?.();
    }
  }

  const previewProps: Partial<PreviewProps> = {
    previewClassName: buttonClassName,
    src: files?.[0] ? URL.createObjectURL(files[0]) : currentPreview,
    onClose: handleOnClose,
    onReload: handleOnReload,
    reloadable: reloadable && Boolean(currentPreview),
    closable,
    deletable: Boolean(currentPreview) && !files.length,
    onDelete: () => {
      setIsRemoved(true);
      onDelete?.(name);
    },
  }


  return (
      <>
        {
          files.length && allowPreview ? (
            <Preview {...previewProps} />
          ) : null
        }
        {
          currentPreview && !files.length && !isRemoved ? (
            <Preview {...previewProps} />
          ) : null
        }
        <motion.button
          ref={ref}
          type='button'
          whileHover={{ scale: 0.95 }}
          className={cn(
            "group flex justify-center border rounded-2xl border-dashed border-iron hover:border-brand-500 aspect-square my-2",
            buttonClassName,
            {
              'flex-row': isHorizontal,
              'flex-col': !isHorizontal,
              'place-items-left': align === 'left',
              'place-items-center': align === 'center',
              'place-items-right': align === 'right',
              'hidden': (files.length && allowPreview) || (Boolean(currentPreview) && !isRemoved),
              'border-brand-500': isHovered === 'dropping',
            }
          )}
          {...buttonProps}
        >
          <ImageIcon
            className={cn(
              'w-8 fill-[#6A6966] group-hover:fill-brand-500',
              {
                'ml-[15px]': isHorizontal,
                'fill-brand-500': isHovered === 'dropping',
              }
            )}
            unforceFill
          />
          {
            placeholder && (
              <p className={cn(
                'max-w-md mx-[12px] text-brand-gray text-sm group-hover:text-brand-500',
                {
                  'text-left': alignText === 'left',
                  'text-center': alignText === 'center',
                  'text-right': alignText === 'right',
                  'my-[12px]': isHorizontal,
                  'text-brand-500': isHovered === 'dropping',
                },
                placeholderClassName,
              )}>
                { placeholder }
              </p>
            )
          }
        </motion.button>   
      </>
  );
}

export default InputImage;




interface PreviewProps {
  closable?: boolean;
  deletable?: boolean;
  onClose?: () => void;
  onDelete?: () => void;
  onReload?: () => void;
  previewClassName?: string;
  reloadable?: boolean;
  src?: string;
}

function Preview({
  closable = true,
  deletable,
  onClose,
  onDelete,
  onReload,
  previewClassName,
  reloadable,
  src,
}: PreviewProps) {
  return (
    <motion.figure
      layout
      initial={{ x: -10, opacity: 0, filter: "blur(4px)" }}
      exit={{ x: -10, opacity: 0, filter: "blur(4px)" }}
      animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
      className={cn(
        'aspect-square relative group border rounded-2xl my-2',
        previewClassName,
      )}
    >
      {reloadable && (
        <button
          type="button"
          onClick={onReload}
          className={cn(
            "group-hover:block hidden bg-black text-white p-1 rounded-full absolute right-5 -top-2",
            {
              "right-2": !closable && !deletable,
              "right-5": closable || deletable,
            }
          )}
        >
          <IoReload />
        </button>
      )}
      {(closable || deletable) && (
        <button
          type="button"
          onClick={deletable ? onDelete : onClose}
          className="group-hover:block hidden bg-black text-white p-1 rounded-full absolute -right-2 -top-2"
        >
          <IoClose />
        </button>
      )}
      <img
        src={src}
        className="rounded-2xl object-cover w-full h-full"
      />
    </motion.figure>
  );
}

interface PreviewVideoProps {
  src: string;
  onClose?: () => void;
}

function PreviewVideo({
  src,
  onClose
}: PreviewVideoProps) {
  return (
    <motion.figure
      layout
      initial={{ x: -10, opacity: 0, filter: "blur(4px)" }}
      exit={{ x: -10, opacity: 0, filter: "blur(4px)" }}
      animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
      className="aspect-square relative group border rounded-2xl my-2 w-[144px] relative"
    >
      <button
        onClick={onClose}
        type="button"
        className="group-hover:block hidden bg-black text-white p-1 rounded-full absolute -right-2 -top-2 z-10 hover:bg-red-500 transition-colors"
        title="Delete video"
      >
        <IoClose />
      </button>
      <video
        loop
        muted
        autoPlay
        src={src}
        className="rounded-2xl object-cover w-full h-full"
        playsInline
      />
    </motion.figure>
  );
}

InputImage.Preview = Preview; 
InputImage.PreviewVideo = PreviewVideo; 