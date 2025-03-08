import {
  MDXEditor,
  UndoRedo,
  BoldItalicUnderlineToggles,
  toolbarPlugin,
  InsertImage,
  BlockTypeSelect,
  InsertCodeBlock,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

export const MarkEditor = () => {
  return (
    <section className="mt-8 mb-3">
      <h2 className="text-2xl">Detalles de tu Asset</h2>
      <p className="py-3">Descripción</p>

      <MDXEditor
        className="border rounded-2xl"
        markdown="Inspírate, y describe tu producto. Cuéntale a tus seguidores todo lo que necesitan saber."
        plugins={[
          toolbarPlugin({
            toolbarClassName: "my-classname",
            toolbarContents: () => (
              <>
                {" "}
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <InsertImage />
                <BlockTypeSelect />
                <InsertCodeBlock />
              </>
            ),
          }),
        ]}
      />
    </section>
  );
};
