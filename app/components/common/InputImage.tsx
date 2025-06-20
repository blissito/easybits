import { motion, type HTMLMotionProps } from 'motion/react';
import { ImageIcon } from '../icons/image';
import { cn } from '~/utils/cn';
import { useDropFiles } from '~/hooks/useDropFiles';
import { IoClose } from 'react-icons/io5';

interface InputImageProps {
  align?: 'center' | 'left' | 'right' | 'none';
  alignText?: 'center' | 'left' | 'right';
  allowPreview?: boolean;
  buttonClassName?: string;
  buttonProps?: HTMLMotionProps<"button">;
  closable?: boolean;
  isHorizontal?: boolean;
  onChange?: (file: File[]) => void;
  onDrop?: (files: File[]) => void;
  persistFiles?: boolean;
  placeholder?: string;
  placeholderClassName?: string;
}

function InputImage({
  align = 'center',
  alignText = 'center',
  allowPreview,
  buttonClassName,
  buttonProps,
  closable,
  isHorizontal,
  onChange,
  onDrop,
  persistFiles = true,
  placeholder,
  placeholderClassName,
}: InputImageProps) {

  const {
    ref,
    files,
    removeFile,
    isHovered,
  } = useDropFiles<HTMLButtonElement>({ onDrop, onChange, persistFiles });

  return (
      <>
        {
          files.length && allowPreview ? (
            <Preview
              previewClassName={buttonClassName}
              src={URL.createObjectURL(files[0])}
              onClose={() => removeFile(0)}
              closable={closable}
            />
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
              'hidden': files.length && allowPreview,
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

InputImage.Preview = Preview;


interface PreviewProps {
  previewClassName?: string;
  src?: string;
  closable?: boolean;
  onClose?: () => void;
}

function Preview({
  previewClassName,
  src,
  closable = true,
  onClose,
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
      {closable && (
        <button
          type="button"
          onClick={onClose}
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
