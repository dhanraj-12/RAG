# 3.BUILD A RETRIEVAL-AUGMENTED GENERATION (RAG) SYSTEM THAT ANSWERS QUESTIONS USING A TEXTBOOK KNOWLEDGE BASE AND RETURNS VERIFIABLE REFERENCES (SECTIONS AND PAGE NUMBERS) 


## Folder Structure:

```
rag_system/
├── data/
│   ├── Book.pdf
│   └── queries.json
├── parent_store_local.zip     # Compressed Parent Store for local testing
├── chroma_db_local.zip       # Compressed Chroma DB for local testing
├── chroma_db/                # Extracted vector database files
├── parent_store/             # Extracted parent document storage files
├── ingestion.ipynb           # Data ingestion and processing pipeline
├── retriever.ipynb           # Retrieval, Reranking, and Generation logic
├── requirements.txt
├── Submission.csv            # Final output: Answers + References
├── .gitignore
└── README.md

```

## Startup Instructions:
1. Clone the repository and navigate to the `rag_system` directory.

2. Install the required dependencies using pip:
    ```
    pip install -r requirements.txt
    ```
3. Run the `ingestion.ipynb` notebook to process the textbook and build the vector database. This is Optional if you want to use the provided `parent_store_local.zip` and `chroma_db_local.zip` for local testing. If you choose to run the ingestion notebook, it will create the necessary files in the `parent_store/` and `chroma_db/` directories.

4. Run the `retriever.ipynb` notebook to execute the retrieval and generation process, and to produce the `Submission.csv` file with answers and references.   


## Note: 
- All the Models used in this project are open-source and run locally, ensuring that the system can be tested and evaluated without reliance on external APIs or services.


## Details of Ingestion Pipeline:
1. The `ingestion.ipynb` notebook performs the following steps:
    - Reads the `Book.pdf` file and convert it into markdown format using marker libary to extract text and images along with chapter and section detail.
    
    - Splits the extracted text into smaller chunks suitable by using **MarkdownHeaderTextSplitter** from langchain_community.document_loaders. The splitter preserves the markdown headers and section information, which is essential for maintaining context during retrieval and generation processes.

    - Generates child documents from the split text, which are then stored in a parent-child relationship in the `parent_store/` directory. Each child document contains a reference to its parent document, allowing for efficient retrieval of relevant sections during the query process.
    
    - Creates a vector database using Chroma, where the child documents are embedded using the BGE-M3 model. The vector database is stored in the `chroma_db_local/` directory, allowing for fast similarity search during retrieval.

## Details of Retrieval and Generation Pipeline:
1. The `retriever.ipynb` notebook performs the following steps:
    - Loads the vector database from the `chroma_db/` directory and initializes the retriever using the Chroma vector store and the BGE-M3 embedding model.
    
    - Reads the queries from the `queries.json` file and used Hypothetical Document Embedding (HyDE) to generate query embeddings.
    
    - Performs a similarity search in the vector database to retrieve relevant child documents based on the query
    
    - perform a BM25 search parrelly on exact query to get the relevant document.
    
    - Combines the retrieved documents using Reciprocal Rank Fusion (RRF) to ensure that the most relevant sections are prioritized.
    
    - Uses the Cross Encoder model `BAAI/bge-reranker-large` to re-rank the retrieved documents based on their relevance to the query.
    
    - Generates answers to the queries using a language model, while also providing verifiable references (sections and page numbers) from the retrieved documents.
    
    - Saves the final answers and references in the `Submission.csv` file for evaluation.

## Note: 
1. The `ingestion.ipynb` notebook includes code to handle the ingestion of the textbook, including text extraction, splitting, and vectorization. The `retriever.ipynb` notebook includes code to perform retrieval based on user queries and to generate answers with references.

2. The `parent_store_local.zip` and `chroma_db_local.zip` files are provided for local testing. You can extract them to the `parent_store/` and `chroma_db/` directories respectively, or you can set up your own persistent storage on disk by following the instructions in the `ingestion.ipynb` notebook.

3. Make sure to adjust the paths in the notebooks if you are using different locations for the data or storage.

4. The `queries.json` file contains the questions that will be used for retrieval and generation. You can modify this file to test with different queries.

5. Use Cuda for the BGE-M3 model to ensure efficient embedding generation. If you do not have access to Cuda-enabled hardware, you may need to adjust the code to run on CPU, but be aware that it will be significantly slower. 