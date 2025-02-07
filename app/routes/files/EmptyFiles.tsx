import Files from "~/components/illustrations/Files";
import { Empty } from "../assets/Empty";
import { BrutalButton } from "~/components/common/BrutalButton";
import { AiOutlineCode } from "react-icons/ai";

export const EmptyFiles = () => {
  return (
    <Empty
      illustration={<Files />}
      title="Hostea tus archivos"
      text={
        <span>
          Utiliza EasyBits para almacenar tus archivos y compartirlos. <br />
          O, consúmelos desde tu sitio web con nuestra API y SDK.
        </span>
      }
      footer={
        <nav className="gap-6 flex">
          <BrutalButton
            className="flex gap-2 items-center"
            mode="ghost"
            icon="<AiOutlineCode />"
          >
            <span>
              <AiOutlineCode />
            </span>
            <span> Usar API</span>
          </BrutalButton>
          <BrutalButton>+ Subir archivos</BrutalButton>
        </nav>
      }
    />
  );
};
