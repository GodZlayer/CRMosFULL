export function notifySuccess(title: string, text = "") {
 if (window.Swal) {
 return window.Swal.fire({
 icon: "success",
 title,
 text,
 timer: 1800,
 showConfirmButton: false
 });
 }
 return Promise.resolve();
}

export function notifyError(error: unknown) {
 const message = error instanceof Error ? error.message : "Erro inesperado.";
 if (window.Swal) {
 return window.Swal.fire({
 icon: "error",
 title: "Não foi possível concluir",
 text: message
 });
 }
 window.alert(message);
 return Promise.resolve();
}