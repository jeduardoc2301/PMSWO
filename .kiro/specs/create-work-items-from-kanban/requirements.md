# Documento de Requisitos

## Introducción

Esta funcionalidad permite a los usuarios crear nuevos work items directamente desde el tablero Kanban de un proyecto. Los usuarios podrán abrir un diálogo de formulario, completar la información requerida del work item (título, descripción, responsable, prioridad, fechas), y crear el elemento mediante el API existente. El tablero Kanban se actualizará automáticamente después de la creación exitosa.

## Glosario

- **Work_Item_Form_Dialog**: Componente de diálogo que contiene el formulario para crear work items
- **Kanban_Board**: Componente que muestra las columnas y work items del proyecto en formato Kanban
- **Project_Detail_Page**: Página que muestra los detalles del proyecto y contiene el tablero Kanban
- **Work_Item_API**: Endpoint REST existente en /api/v1/projects/[id]/work-items que maneja la creación de work items
- **Translation_System**: Sistema i18n que proporciona traducciones en español y portugués
- **Form_Validator**: Lógica que valida los datos del formulario antes de enviarlos al API

## Requisitos

### Requisito 1: Componente de Diálogo de Formulario

**User Story:** Como usuario ejecutivo, quiero abrir un diálogo de formulario desde el tablero Kanban, para poder crear nuevos work items sin salir de la vista del proyecto.

#### Acceptance Criteria

1. THE Work_Item_Form_Dialog SHALL render como un componente de diálogo modal
2. WHEN el diálogo se abre, THE Work_Item_Form_Dialog SHALL mostrar un formulario con campos para título, descripción, responsable, prioridad, fecha de inicio y fecha estimada de finalización
3. THE Work_Item_Form_Dialog SHALL usar los componentes UI existentes (Dialog, Select, Input, Textarea, Button)
4. THE Work_Item_Form_Dialog SHALL obtener todas las traducciones desde el Translation_System usando la clave "work-items"
5. WHEN el usuario hace clic en el botón de cancelar, THE Work_Item_Form_Dialog SHALL cerrar el diálogo sin realizar cambios
6. THE Work_Item_Form_Dialog SHALL exponer una prop "onSuccess" que se invoca después de crear exitosamente un work item

### Requisito 2: Validación de Formulario

**User Story:** Como usuario ejecutivo, quiero que el formulario valide mis datos antes de enviarlos, para evitar errores y recibir retroalimentación clara sobre campos incorrectos.

#### Acceptance Criteria

1. WHEN el usuario intenta enviar el formulario, THE Form_Validator SHALL verificar que el título no esté vacío
2. WHEN el usuario intenta enviar el formulario, THE Form_Validator SHALL verificar que el título no exceda 255 caracteres
3. WHEN el usuario intenta enviar el formulario, THE Form_Validator SHALL verificar que la descripción no esté vacía
4. WHEN el usuario intenta enviar el formulario, THE Form_Validator SHALL verificar que se haya seleccionado un responsable
5. WHEN el usuario intenta enviar el formulario, THE Form_Validator SHALL verificar que se haya seleccionado una prioridad
6. WHEN el usuario intenta enviar el formulario, THE Form_Validator SHALL verificar que se haya seleccionado una fecha de inicio
7. WHEN el usuario intenta enviar el formulario, THE Form_Validator SHALL verificar que se haya seleccionado una fecha estimada de finalización
8. IF algún campo es inválido, THEN THE Form_Validator SHALL mostrar mensajes de error específicos para cada campo
9. WHILE el formulario contiene errores de validación, THE Work_Item_Form_Dialog SHALL deshabilitar el botón de envío

### Requisito 3: Integración con API

**User Story:** Como usuario ejecutivo, quiero que el formulario envíe los datos al servidor, para que el work item se persista en la base de datos.

#### Acceptance Criteria

1. WHEN el usuario envía el formulario con datos válidos, THE Work_Item_Form_Dialog SHALL realizar una petición POST al Work_Item_API con el formato correcto
2. THE Work_Item_Form_Dialog SHALL incluir en la petición: title, description, ownerId, priority, startDate, estimatedEndDate
3. WHILE la petición está en progreso, THE Work_Item_Form_Dialog SHALL mostrar un indicador de carga
4. WHILE la petición está en progreso, THE Work_Item_Form_Dialog SHALL deshabilitar todos los controles del formulario
5. WHEN la petición es exitosa (status 201), THE Work_Item_Form_Dialog SHALL cerrar el diálogo
6. WHEN la petición es exitosa (status 201), THE Work_Item_Form_Dialog SHALL invocar el callback onSuccess
7. IF la petición falla con error de validación (status 400), THEN THE Work_Item_Form_Dialog SHALL mostrar el mensaje de error del servidor
8. IF la petición falla con error de servidor (status 500), THEN THE Work_Item_Form_Dialog SHALL mostrar un mensaje de error genérico traducido

### Requisito 4: Integración con Tablero Kanban

**User Story:** Como usuario ejecutivo, quiero ver un botón para crear work items en el tablero Kanban, para poder agregar elementos rápidamente mientras visualizo el proyecto.

#### Acceptance Criteria

1. THE Kanban_Board SHALL mostrar un botón "Crear Work Item" en la parte superior del tablero
2. WHEN el usuario hace clic en el botón "Crear Work Item", THE Kanban_Board SHALL abrir el Work_Item_Form_Dialog
3. WHEN el Work_Item_Form_Dialog invoca el callback onSuccess, THE Kanban_Board SHALL refrescar los datos del tablero Kanban
4. WHEN el Work_Item_Form_Dialog invoca el callback onSuccess, THE Kanban_Board SHALL mostrar un mensaje de éxito traducido
5. THE Kanban_Board SHALL obtener la lista de usuarios del proyecto para el selector de responsables

### Requisito 5: Actualización de Traducciones

**User Story:** Como usuario que habla español o portugués, quiero ver todas las etiquetas del formulario en mi idioma, para entender claramente qué información debo proporcionar.

#### Acceptance Criteria

1. THE Translation_System SHALL incluir traducciones en español para: "createWorkItemDialog", "formTitle", "formDescription", "selectOwner", "selectPriority", "cancel", "create", "creating"
2. THE Translation_System SHALL incluir traducciones en portugués para: "createWorkItemDialog", "formTitle", "formDescription", "selectOwner", "selectPriority", "cancel", "create", "creating"
3. THE Translation_System SHALL incluir traducciones de mensajes de validación en español: "titleRequired", "titleTooLong", "descriptionRequired", "ownerRequired", "priorityRequired", "startDateRequired", "endDateRequired"
4. THE Translation_System SHALL incluir traducciones de mensajes de validación en portugués: "titleRequired", "titleTooLong", "descriptionRequired", "ownerRequired", "priorityRequired", "startDateRequired", "endDateRequired"
5. THE Translation_System SHALL mantener las traducciones existentes de prioridades y estados sin modificaciones

### Requisito 6: Actualización de Página de Detalle del Proyecto

**User Story:** Como usuario ejecutivo, quiero que el tablero Kanban se actualice automáticamente después de crear un work item, para ver inmediatamente el nuevo elemento sin recargar la página.

#### Acceptance Criteria

1. WHEN el Work_Item_Form_Dialog invoca el callback onSuccess, THE Project_Detail_Page SHALL realizar una nueva petición al endpoint de Kanban
2. WHEN la petición de actualización es exitosa, THE Project_Detail_Page SHALL actualizar el estado local del kanbanBoard con los nuevos datos
3. WHEN la petición de actualización es exitosa, THE Project_Detail_Page SHALL actualizar las métricas del proyecto
4. IF la petición de actualización falla, THEN THE Project_Detail_Page SHALL mostrar un mensaje de error pero mantener el diálogo cerrado

### Requisito 7: Obtención de Lista de Usuarios

**User Story:** Como usuario ejecutivo, quiero seleccionar el responsable de un work item desde una lista de usuarios del proyecto, para asignar correctamente las tareas.

#### Acceptance Criteria

1. WHEN el Work_Item_Form_Dialog se abre, THE Work_Item_Form_Dialog SHALL obtener la lista de usuarios del proyecto mediante una petición al API
2. THE Work_Item_Form_Dialog SHALL mostrar un selector con los nombres de los usuarios disponibles
3. WHILE la lista de usuarios se está cargando, THE Work_Item_Form_Dialog SHALL mostrar un indicador de carga en el selector
4. IF la petición de usuarios falla, THEN THE Work_Item_Form_Dialog SHALL mostrar un mensaje de error y deshabilitar el selector de responsables
5. THE Work_Item_Form_Dialog SHALL enviar el userId seleccionado como ownerId en la petición de creación

### Requisito 8: Manejo de Estados del Formulario

**User Story:** Como usuario ejecutivo, quiero que el formulario mantenga un estado consistente durante todo el proceso de creación, para tener una experiencia fluida y sin errores.

#### Acceptance Criteria

1. WHEN el diálogo se abre, THE Work_Item_Form_Dialog SHALL inicializar todos los campos del formulario vacíos
2. WHEN el diálogo se cierra, THE Work_Item_Form_Dialog SHALL limpiar todos los campos del formulario
3. WHEN el diálogo se cierra, THE Work_Item_Form_Dialog SHALL limpiar todos los mensajes de error
4. WHILE el usuario escribe en un campo con error, THE Work_Item_Form_Dialog SHALL limpiar el mensaje de error de ese campo
5. THE Work_Item_Form_Dialog SHALL mantener el estado de carga separado del estado de validación
