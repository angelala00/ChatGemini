export const fillTextAreaValue = (
    textArea: HTMLTextAreaElement | null,
    value: string,
) => {
    if (!textArea) {
        return;
    }

    textArea.focus();
    const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
    )?.set;

    if (valueSetter) {
        valueSetter.call(textArea, value);
    } else {
        textArea.value = value;
    }

    textArea.setSelectionRange(value.length, value.length);
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
};
